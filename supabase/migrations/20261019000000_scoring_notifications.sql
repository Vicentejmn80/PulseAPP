-- Puntaje LVBP (PDF): 40 por ganador + max(0, 40 - 5×E). Si el ganador no coincide, 0.
-- Reemplaza las bandas viejas (36, 32, 28…). No reescribe partidos ya liquidados:
-- el saldo vigente sigue en pulse_transactions (source_type = prediction) y el
-- ranking es la suma de esa tabla. Cada corrección o anulación deja el delta en
-- pulse_score_ledger, que no se vuelve a sumar.
-- Constantes en pulse_scoring_config (id = lvbp). Cambiarlas ahí cambia el cálculo.

create table if not exists public.pulse_scoring_config (
  id text primary key,
  winner_points integer not null check (winner_points >= 0),
  closeness_points integer not null check (closeness_points >= 0),
  error_step integer not null check (error_step > 0)
);

insert into public.pulse_scoring_config (id, winner_points, closeness_points, error_step)
values ('lvbp', 40, 40, 5)
on conflict (id) do nothing;

alter table public.pulse_scoring_config enable row level security;
revoke all on table public.pulse_scoring_config from public, anon, authenticated;

alter table public.pulse_match_predictions
  add column if not exists points_total integer,
  add column if not exists points_base integer,
  add column if not exists points_closeness integer,
  add column if not exists error_total integer,
  add column if not exists hit_winner boolean,
  add column if not exists voided_at timestamptz,
  add column if not exists score_breakdown jsonb;

alter table public.pulse_transactions
  add column if not exists cycle_id text;

create table if not exists public.pulse_score_ledger (
  id text primary key,
  prediction_id text not null,
  user_id text not null,
  match_id text not null,
  kind text not null check (kind in ('settle', 'correct', 'void')),
  previous_points integer not null,
  new_points integer not null,
  delta integer not null,
  admin_id text,
  breakdown jsonb not null default '{}'::jsonb,
  revision integer not null,
  created_at timestamptz not null default now(),
  unique (prediction_id, revision)
);

create index if not exists pulse_score_ledger_match_idx
  on public.pulse_score_ledger (match_id, created_at desc);

alter table public.pulse_score_ledger enable row level security;
revoke all on table public.pulse_score_ledger from public, anon, authenticated;

create table if not exists public.pulse_notifications (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text not null,
  datos jsonb not null default '{}'::jsonb,
  pronostico_id text,
  leida_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists pulse_notifications_dedupe
  on public.pulse_notifications (user_id, tipo, pronostico_id);

create index if not exists pulse_notifications_user_created_idx
  on public.pulse_notifications (user_id, leida_at, created_at desc);

create index if not exists pulse_match_predictions_match_idx
  on public.pulse_match_predictions (match_id);

create index if not exists pulse_transactions_user_created_idx
  on public.pulse_transactions (user_id, created_at desc);

alter table public.pulse_notifications enable row level security;
revoke all on table public.pulse_notifications from public, anon, authenticated;

update public.pulse_match_predictions as pred
set points_total = tx.points,
    points_base = nullif(tx.metadata->>'winnerPoints', '')::integer,
    points_closeness = nullif(tx.metadata->>'closenessPoints', '')::integer,
    error_total = nullif(tx.metadata->>'errorTotal', '')::integer,
    hit_winner = coalesce(nullif(tx.metadata->>'winnerPoints', '')::integer, 0) = 40,
    score_breakdown = tx.metadata
from public.pulse_transactions tx
where tx.source_type = 'prediction'
  and tx.source_id = pred.id
  and pred.points_total is null;

create or replace function public.pulse_closeness_points(p_error integer)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  closeness_points integer;
  error_step integer;
begin
  select cfg.closeness_points, cfg.error_step
    into closeness_points, error_step
  from public.pulse_scoring_config cfg
  where cfg.id = 'lvbp';
  return greatest(0, coalesce(closeness_points, 40) - coalesce(error_step, 5) * greatest(coalesce(p_error, 0), 0));
end;
$$;

create or replace function public.pulse_score_breakdown(
  p_pred_home integer,
  p_pred_away integer,
  p_actual_home integer,
  p_actual_away integer
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  winner_points integer;
  closeness_points integer;
  error_step integer;
  v_error integer;
  v_hit boolean;
  v_tie_pred boolean;
  v_tie_real boolean;
  v_base integer;
  v_extra integer;
begin
  select cfg.winner_points, cfg.closeness_points, cfg.error_step
    into winner_points, closeness_points, error_step
  from public.pulse_scoring_config cfg
  where cfg.id = 'lvbp';
  winner_points := coalesce(winner_points, 40);
  closeness_points := coalesce(closeness_points, 40);
  error_step := coalesce(error_step, 5);
  v_tie_pred := p_pred_home = p_pred_away;
  v_tie_real := p_actual_home = p_actual_away;
  v_error := abs(p_pred_home - p_actual_home) + abs(p_pred_away - p_actual_away);
  v_hit := not v_tie_pred and not v_tie_real
    and ((p_pred_home > p_pred_away) = (p_actual_home > p_actual_away));
  v_base := case when v_hit then winner_points else 0 end;
  v_extra := case when v_hit then greatest(0, closeness_points - error_step * v_error) else 0 end;
  return jsonb_build_object(
    'winnerPoints', v_base,
    'closenessPoints', v_extra,
    'total', v_base + v_extra,
    'errorTotal', v_error,
    'hitWinner', v_hit,
    'tiedPrediction', v_tie_pred,
    'tiedResult', v_tie_real
  );
end;
$$;

create or replace function public.pulse_score_notice(
  p_points integer,
  p_previous integer,
  p_error integer,
  p_base integer,
  p_close integer,
  p_cap integer,
  p_pred text,
  p_real text,
  p_label text,
  p_void boolean
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_title text;
  v_body text;
  v_silent boolean := false;
begin
  if coalesce(p_void, false) then
    return jsonb_build_object(
      'tipo', 'anulado',
      'titulo', 'Juego anulado',
      'cuerpo', 'Se anuló ' || p_label || '. Tu pronóstico queda sin efecto.',
      'silenciosa', false
    );
  end if;
  if p_previous is not null and p_previous is distinct from p_points then
    return jsonb_build_object(
      'tipo', 'resultado',
      'titulo', 'Resultado corregido',
      'cuerpo', 'Se corrigió el resultado de ' || p_label || '. Tus puntos para este juego ahora son ' || p_points::text || ' (antes ' || p_previous::text || ').',
      'silenciosa', false
    );
  end if;
  if p_points >= 80 then
    v_title := '¡Marcador exacto! 🎯 +' || p_points::text || ' puntos';
    v_body := 'Clavaste ' || p_pred || '.';
  elsif p_points >= 70 then
    v_title := '¡Felicidades! 🎉 +' || p_points::text || ' puntos';
    v_body := 'Acertaste el ganador y quedaste a ' || p_error::text || ' '
      || case when p_error = 1 then 'carrera' else 'carreras' end || ' del marcador.';
  elsif p_points >= 50 then
    v_title := '¡Vas muy bien! 🔥 +' || p_points::text || ' puntos';
    v_body := 'Acertaste el ganador (+' || p_base::text || ') y tu marcador sumó +' || p_close::text || '.';
  elsif p_points >= 40 then
    v_title := '¡Vas por buen camino! 👏 +' || p_points::text || ' puntos';
    v_body := 'Acertaste el ganador (+' || p_base::text || '). Acércate más al marcador para sumar hasta ' || coalesce(p_cap, 40)::text || ' extra.';
  else
    v_title := 'Esta vez no sumaste';
    v_body := 'Tu pronóstico fue ' || p_pred || ', terminó ' || p_real || '. ¡El próximo juego es tuyo!';
    v_silent := true;
  end if;
  return jsonb_build_object('tipo', 'resultado', 'titulo', v_title, 'cuerpo', v_body, 'silenciosa', v_silent);
end;
$$;

create or replace function public.pulse_scoring_rules()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  winner_points integer;
  closeness_points integer;
  error_step integer;
  bands jsonb := '[]'::jsonb;
  idx integer;
  extra integer;
  last_error integer;
begin
  select cfg.winner_points, cfg.closeness_points, cfg.error_step
    into winner_points, closeness_points, error_step
  from public.pulse_scoring_config cfg
  where cfg.id = 'lvbp';
  winner_points := coalesce(winner_points, 40);
  closeness_points := coalesce(closeness_points, 40);
  error_step := coalesce(error_step, 5);
  last_error := closeness_points / error_step;
  for idx in 0..(last_error - 1) loop
    extra := closeness_points - error_step * idx;
    bands := bands || jsonb_build_array(jsonb_build_object(
      'error', idx::text,
      'closeness', extra,
      'total', winner_points + extra
    ));
  end loop;
  bands := bands || jsonb_build_array(jsonb_build_object(
    'error', last_error::text || ' o más',
    'closeness', 0,
    'total', winner_points
  ));
  return jsonb_build_object(
    'ok', true,
    'winnerPoints', winner_points,
    'closenessPoints', closeness_points,
    'errorStep', error_step,
    'max', winner_points + closeness_points,
    'bands', bands
  );
end;
$$;

create or replace function public.pulse_admin_preview_result(
  p_admin_key text,
  p_match_id text,
  p_home_score integer,
  p_away_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.pulse_matches;
  predictions integer := 0;
  winners integer := 0;
  exact integer := 0;
  awarded integer := 0;
  n80 integer := 0;
  n70 integer := 0;
  n50 integer := 0;
  n40 integer := 0;
  n0 integer := 0;
begin
  if trim(coalesce(p_admin_key, '')) like 'sess_%' then
    perform public.pulse_admin_actor(p_admin_key);
  else
    perform public.pulse_require_admin(p_admin_key);
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 99 or p_away_score > 99 then
    return jsonb_build_object('ok', false, 'error', 'Escribe un marcador entero, desde cero.');
  end if;
  if p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'En béisbol no hay empates, revisa el marcador');
  end if;
  select * into game from public.pulse_matches where id = trim(coalesce(p_match_id, ''));
  if game.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if game.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'Un juego anulado no se liquida.');
  end if;
  if game.starts_at > now() then
    return jsonb_build_object('ok', false, 'error', 'Este juego aún no empieza. No se puede cargar el resultado todavía.');
  end if;
  select
    count(*)::integer,
    count(*) filter (where (b.breakdown->>'hitWinner')::boolean)::integer,
    count(*) filter (where (b.breakdown->>'hitWinner')::boolean and (b.breakdown->>'errorTotal')::integer = 0)::integer,
    coalesce(sum((b.breakdown->>'total')::integer), 0)::integer,
    count(*) filter (where (b.breakdown->>'total')::integer >= 80)::integer,
    count(*) filter (where (b.breakdown->>'total')::integer between 70 and 79)::integer,
    count(*) filter (where (b.breakdown->>'total')::integer between 50 and 69)::integer,
    count(*) filter (where (b.breakdown->>'total')::integer between 40 and 49)::integer,
    count(*) filter (where (b.breakdown->>'total')::integer = 0)::integer
  into predictions, winners, exact, awarded, n80, n70, n50, n40, n0
  from public.pulse_match_predictions pred
  cross join lateral (
    select public.pulse_score_breakdown(pred.predicted_home_score, pred.predicted_away_score, p_home_score, p_away_score) as breakdown
  ) b
  where pred.match_id = game.id
    and pred.voided_at is null
    and (
      coalesce(game.is_demo, false)
      or coalesce(game.is_simulation, false)
      or pred.created_at < game.starts_at
    );
  return jsonb_build_object(
    'ok', true,
    'predictions', predictions,
    'winners', winners,
    'exact', exact,
    'points', awarded,
    'bands', jsonb_build_array(
      jsonb_build_object('label', '80', 'count', n80),
      jsonb_build_object('label', '70 a 75', 'count', n70),
      jsonb_build_object('label', '50 a 65', 'count', n50),
      jsonb_build_object('label', '40 a 45', 'count', n40),
      jsonb_build_object('label', '0', 'count', n0)
    )
  );
end;
$$;

create or replace function public.pulse_score_match_rows(
  p_match_id text,
  p_home integer,
  p_away integer,
  p_admin text
)
returns table (
  prediction_id text,
  user_id text,
  pred_home integer,
  pred_away integer,
  old_points integer,
  new_points integer,
  base_points integer,
  close_points integer,
  error_total integer,
  hit_winner boolean,
  breakdown jsonb,
  cycle_id text,
  max_rev integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pred.id,
    pred.user_id,
    pred.predicted_home_score,
    pred.predicted_away_score,
    tx.points,
    (b.breakdown->>'total')::integer,
    (b.breakdown->>'winnerPoints')::integer,
    (b.breakdown->>'closenessPoints')::integer,
    (b.breakdown->>'errorTotal')::integer,
    coalesce((b.breakdown->>'hitWinner')::boolean, false),
    b.breakdown || jsonb_build_object(
      'matchId', game.id,
      'homeScore', p_home,
      'awayScore', p_away,
      'matchStartsAt', game.starts_at,
      'adminId', p_admin
    ),
    cycle.id,
    coalesce(rev.max_rev, 0)::integer
  from public.pulse_matches game
  join public.pulse_match_predictions pred on pred.match_id = game.id
  left join public.pulse_transactions tx
    on tx.source_type = 'prediction' and tx.source_id = pred.id
  cross join lateral (
    select public.pulse_score_breakdown(
      pred.predicted_home_score, pred.predicted_away_score, p_home, p_away
    ) as breakdown
  ) b
  left join lateral (
    select c.id
    from public.pulse_cycles c
    where (game.starts_at at time zone 'America/Caracas')::date between c.starts_on and c.ends_on
    order by c.starts_on desc
    limit 1
  ) cycle on true
  left join lateral (
    select max(led.revision) as max_rev
    from public.pulse_score_ledger led
    where led.prediction_id = pred.id
  ) rev on true
  where game.id = p_match_id
    and pred.voided_at is null
    and (
      coalesce(game.is_demo, false)
      or coalesce(game.is_simulation, false)
      or pred.created_at < game.starts_at
    );
$$;

create or replace function public.pulse_admin_set_result(
  p_admin_key text,
  p_match_id text,
  p_home_score integer,
  p_away_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  game public.pulse_matches;
  same_result boolean;
  scored integer := 0;
  awarded integer := 0;
  cap integer;
begin
  if trim(coalesce(p_admin_key, '')) like 'sess_%' then
    actor := public.pulse_admin_actor(p_admin_key);
  else
    perform public.pulse_require_admin(p_admin_key);
    actor := null;
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 99 or p_away_score > 99 then
    return jsonb_build_object('ok', false, 'error', 'Escribe un marcador entero, desde cero.');
  end if;
  if p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'En béisbol no hay empates, revisa el marcador');
  end if;

  perform public.pulse_lock_due_matches();
  select * into game from public.pulse_matches where id = trim(coalesce(p_match_id, '')) for update;
  if game.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if game.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'Un juego anulado no se liquida.');
  end if;
  if game.starts_at > now() and game.status <> 'finished' then
    return jsonb_build_object('ok', false, 'error', 'Este juego aún no empieza. No se puede cargar el resultado todavía.');
  end if;

  same_result := game.status = 'finished'
    and game.home_score = p_home_score
    and game.away_score = p_away_score;
  if same_result and not exists (
    select 1
    from public.pulse_match_predictions pred
    where pred.match_id = game.id
      and pred.voided_at is null
      and (
        coalesce(game.is_demo, false)
        or coalesce(game.is_simulation, false)
        or pred.created_at < game.starts_at
      )
      and not exists (
        select 1 from public.pulse_transactions tx
        where tx.source_type = 'prediction' and tx.source_id = pred.id
      )
  ) then
    perform public.pulse_evaluate_match_challenges(game.id, p_home_score, p_away_score);
    perform public.pulse_resolve_duels(game.id);
    if actor is not null then
      insert into public.pulse_admin_audit (user_id, action, target, ok, details)
      values (actor, 'pulse_admin_set_result', game.id, true, jsonb_build_object('idempotent', true, 'home', p_home_score, 'away', p_away_score));
    end if;
    return jsonb_build_object('ok', true, 'scored', 0, 'points', 0, 'idempotent', true);
  end if;

  select cfg.closeness_points into cap from public.pulse_scoring_config cfg where cfg.id = 'lvbp';
  cap := coalesce(cap, 40);

  update public.pulse_matches
  set home_score = p_home_score,
      away_score = p_away_score,
      status = 'finished',
      updated_at = now()
  where id = game.id;

  insert into public.pulse_score_ledger (
    id, prediction_id, user_id, match_id, kind, previous_points, new_points, delta, admin_id, breakdown, revision
  )
  select
    'led_' || replace(gen_random_uuid()::text, '-', ''),
    s.prediction_id,
    s.user_id,
    game.id,
    case when s.old_points is null then 'settle' else 'correct' end,
    coalesce(s.old_points, 0),
    s.new_points,
    s.new_points - coalesce(s.old_points, 0),
    actor,
    s.breakdown,
    s.max_rev + 1
  from public.pulse_score_match_rows(game.id, p_home_score, p_away_score, actor) s
  where s.old_points is null or s.old_points is distinct from s.new_points;

  get diagnostics scored = row_count;
  select coalesce(sum(s.new_points), 0)::integer into awarded
  from public.pulse_score_match_rows(game.id, p_home_score, p_away_score, actor) s
  where s.old_points is null or s.old_points is distinct from s.new_points;

  insert into public.pulse_notifications (id, user_id, tipo, titulo, cuerpo, datos, pronostico_id)
  select
    'ntf_' || replace(gen_random_uuid()::text, '-', ''),
    s.user_id,
    n.notice->>'tipo',
    n.notice->>'titulo',
    n.notice->>'cuerpo',
    jsonb_build_object(
      'partidoId', game.id,
      'pronosticoId', s.prediction_id,
      'puntos', s.new_points,
      'error', s.error_total,
      'base', s.base_points,
      'cercania', s.close_points,
      'anterior', s.old_points,
      'silenciosa', coalesce((n.notice->>'silenciosa')::boolean, false),
      'homeTeam', game.home_team,
      'awayTeam', game.away_team,
      'predHome', s.pred_home,
      'predAway', s.pred_away,
      'homeScore', p_home_score,
      'awayScore', p_away_score
    ),
    s.prediction_id
  from public.pulse_score_match_rows(game.id, p_home_score, p_away_score, actor) s
  cross join lateral (
    select public.pulse_score_notice(
      s.new_points,
      s.old_points,
      s.error_total,
      s.base_points,
      s.close_points,
      cap,
      game.home_team || ' ' || s.pred_home::text || ' – ' || game.away_team || ' ' || s.pred_away::text,
      game.home_team || ' ' || p_home_score::text || ' – ' || game.away_team || ' ' || p_away_score::text,
      game.away_team || ' vs ' || game.home_team,
      false
    ) as notice
  ) n
  where s.old_points is null or s.old_points is distinct from s.new_points
  on conflict (user_id, tipo, pronostico_id) do update
  set titulo = excluded.titulo,
      cuerpo = excluded.cuerpo,
      datos = excluded.datos,
      leida_at = null,
      created_at = now();

  insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata, cycle_id)
  select
    'tx_' || s.prediction_id,
    s.user_id,
    'exp_tobo',
    'prediction',
    s.prediction_id,
    s.new_points,
    s.breakdown,
    s.cycle_id
  from public.pulse_score_match_rows(game.id, p_home_score, p_away_score, actor) s
  where not exists (
    select 1 from public.pulse_transactions tx
    where tx.source_type = 'prediction' and tx.source_id = s.prediction_id
  );

  update public.pulse_transactions tx
  set points = s.new_points,
      metadata = s.breakdown || jsonb_build_object('previousPoints', s.old_points, 'correctedAt', now()),
      cycle_id = coalesce(s.cycle_id, tx.cycle_id)
  from public.pulse_score_match_rows(game.id, p_home_score, p_away_score, actor) s
  where tx.source_type = 'prediction'
    and tx.source_id = s.prediction_id
    and (
      tx.points is distinct from s.new_points
      or tx.metadata->>'errorTotal' is distinct from s.error_total::text
      or tx.metadata->>'homeScore' is distinct from p_home_score::text
    );

  update public.pulse_match_predictions pred
  set processed_at = coalesce(pred.processed_at, now()),
      locked_at = coalesce(pred.locked_at, game.starts_at),
      points_total = s.new_points,
      points_base = s.base_points,
      points_closeness = s.close_points,
      error_total = s.error_total,
      hit_winner = s.hit_winner,
      voided_at = null,
      score_breakdown = s.breakdown,
      updated_at = now()
  from public.pulse_score_match_rows(game.id, p_home_score, p_away_score, actor) s
  where pred.id = s.prediction_id;

  perform public.pulse_evaluate_match_challenges(game.id, p_home_score, p_away_score);
  perform public.pulse_resolve_duels(game.id);

  if actor is not null then
    insert into public.pulse_admin_audit (user_id, action, target, ok, details)
    values (
      actor,
      'pulse_admin_set_result',
      game.id,
      true,
      jsonb_build_object('home', p_home_score, 'away', p_away_score, 'scored', scored, 'points', awarded, 'corrected', game.status = 'finished')
    );
  end if;

  return jsonb_build_object('ok', true, 'scored', scored, 'points', awarded, 'idempotent', false);
end;
$$;

create or replace function public.pulse_admin_cancel(p_admin_key text, p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  game public.pulse_matches;
  reversed integer := 0;
begin
  if trim(coalesce(p_admin_key, '')) like 'sess_%' then
    actor := public.pulse_admin_actor(p_admin_key);
  else
    perform public.pulse_require_admin(p_admin_key);
    actor := null;
  end if;
  select * into game from public.pulse_matches where id = trim(coalesce(p_match_id, '')) for update;
  if game.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if game.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'reversed', 0);
  end if;

  insert into public.pulse_score_ledger (
    id, prediction_id, user_id, match_id, kind, previous_points, new_points, delta, admin_id, breakdown, revision
  )
  select
    'led_' || replace(gen_random_uuid()::text, '-', ''),
    pred.id,
    pred.user_id,
    game.id,
    'void',
    tx.points,
    0,
    -tx.points,
    actor,
    coalesce(tx.metadata, '{}'::jsonb),
    coalesce((select max(led.revision) from public.pulse_score_ledger led where led.prediction_id = pred.id), 0) + 1
  from public.pulse_match_predictions pred
  join public.pulse_transactions tx
    on tx.source_type = 'prediction' and tx.source_id = pred.id
  where pred.match_id = game.id
    and tx.points <> 0;

  get diagnostics reversed = row_count;

  update public.pulse_transactions tx
  set points = 0,
      metadata = tx.metadata || jsonb_build_object('voidedAt', now(), 'previousPoints', tx.points, 'adminId', actor)
  from public.pulse_match_predictions pred
  where pred.match_id = game.id
    and tx.source_type = 'prediction'
    and tx.source_id = pred.id
    and tx.points <> 0;

  update public.pulse_transactions tx
  set points = 0,
      metadata = tx.metadata || jsonb_build_object('voidedAt', now(), 'previousPoints', tx.points)
  where tx.source_type = 'game_challenge'
    and tx.metadata->>'matchId' = game.id
    and tx.points <> 0;

  update public.pulse_challenge_answers ans
  set points_awarded = 0
  from public.pulse_game_challenges challenge
  where ans.game_challenge_id = challenge.id
    and challenge.game_id = game.id
    and coalesce(ans.points_awarded, 0) <> 0;

  update public.pulse_match_predictions pred
  set voided_at = coalesce(pred.voided_at, now()),
      processed_at = coalesce(pred.processed_at, now()),
      locked_at = coalesce(pred.locked_at, game.starts_at),
      points_total = case when pred.points_total is null and not exists (
        select 1 from public.pulse_transactions tx
        where tx.source_type = 'prediction' and tx.source_id = pred.id
      ) then pred.points_total else 0 end,
      hit_winner = false,
      updated_at = now()
  where pred.match_id = game.id;

  update public.pulse_notifications note
  set leida_at = coalesce(note.leida_at, now())
  where note.tipo = 'resultado'
    and note.pronostico_id in (select pred.id from public.pulse_match_predictions pred where pred.match_id = game.id);

  insert into public.pulse_notifications (id, user_id, tipo, titulo, cuerpo, datos, pronostico_id)
  select
    'ntf_' || replace(gen_random_uuid()::text, '-', ''),
    pred.user_id,
    n.notice->>'tipo',
    n.notice->>'titulo',
    n.notice->>'cuerpo',
    jsonb_build_object(
      'partidoId', game.id,
      'pronosticoId', pred.id,
      'silenciosa', false,
      'homeTeam', game.home_team,
      'awayTeam', game.away_team
    ),
    pred.id
  from public.pulse_match_predictions pred
  cross join lateral (
    select public.pulse_score_notice(0, null, 0, 0, 0, 40, '', '', game.away_team || ' vs ' || game.home_team, true) as notice
  ) n
  where pred.match_id = game.id
  on conflict (user_id, tipo, pronostico_id) do update
  set titulo = excluded.titulo,
      cuerpo = excluded.cuerpo,
      datos = excluded.datos,
      leida_at = null,
      created_at = now();

  update public.pulse_matches
  set status = 'cancelled',
      updated_at = now()
  where id = game.id;

  if actor is not null then
    insert into public.pulse_admin_audit (user_id, action, target, ok, details)
    values (actor, 'pulse_admin_cancel', game.id, true, jsonb_build_object('reversed', reversed));
  end if;

  return jsonb_build_object('ok', true, 'idempotent', false, 'reversed', reversed);
end;
$$;

create or replace function public.pulse_notifications_list(
  p_token text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  off integer := least(greatest(coalesce(p_offset, 0), 0), 500);
  unread integer;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para ver tus avisos.');
  end if;
  select count(*)::integer into unread
  from public.pulse_notifications note
  where note.user_id = uid
    and note.leida_at is null
    and coalesce((note.datos->>'silenciosa')::boolean, false) = false;
  return jsonb_build_object(
    'ok', true,
    'unread', unread,
    'items', coalesce((
      select jsonb_agg(row_to_json(item) order by item."createdAt" desc)
      from (
        select
          note.id,
          note.tipo,
          note.titulo as title,
          note.cuerpo as body,
          note.datos,
          note.leida_at is not null as read,
          note.created_at as "createdAt"
        from public.pulse_notifications note
        where note.user_id = uid
        order by note.created_at desc
        limit lim offset off
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_notifications_read(p_token text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para ver tus avisos.');
  end if;
  update public.pulse_notifications
  set leida_at = coalesce(leida_at, now())
  where id = trim(coalesce(p_id, ''))
    and user_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_notifications_read_all(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para ver tus avisos.');
  end if;
  update public.pulse_notifications
  set leida_at = now()
  where user_id = uid
    and leida_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_save_prediction(
  p_token text,
  p_match_id text,
  p_winner text,
  p_home_score integer,
  p_away_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  winner text;
begin
  perform public.pulse_lock_due_matches();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para guardar el pronóstico.');
  end if;
  select * into match from public.pulse_matches where id = p_match_id for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.is_demo and exists (
    select 1 from public.pulse_demo_sessions session
    where session.match_id = match.id and session.user_id = uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'El pronóstico de esta experiencia ya quedó guardado.');
  end if;
  if match.status in ('finished', 'cancelled', 'locked')
     or (not match.is_demo and match.starts_at <= now()) then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. El pronóstico está cerrado.');
  end if;
  if match.is_demo and match.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'error', 'Este juego no está abierto para pronosticar.');
  end if;
  if not match.is_demo and match.status not in ('scheduled', 'postponed') then
    return jsonb_build_object('ok', false, 'error', 'Este juego no está abierto para pronosticar.');
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 99 or p_away_score > 99 then
    return jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un número entero entre 0 y 99.');
  end if;
  if p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'Elige un ganador: el marcador no puede quedar empatado');
  end if;
  winner := trim(p_winner);
  if winner <> match.home_team and winner <> match.away_team then
    return jsonb_build_object('ok', false, 'error', 'Elige uno de los dos equipos.');
  end if;
  if (p_home_score > p_away_score and winner <> match.home_team)
     or (p_away_score > p_home_score and winner <> match.away_team) then
    return jsonb_build_object('ok', false, 'error', 'El ganador no coincide con el marcador.');
  end if;

  insert into public.pulse_match_predictions (
    id, user_id, match_id, predicted_winner, predicted_home_score, predicted_away_score
  ) values (
    'pred_' || replace(gen_random_uuid()::text, '-', ''),
    uid, match.id, winner, p_home_score, p_away_score
  )
  on conflict (user_id, match_id) do update
  set predicted_winner = excluded.predicted_winner,
      predicted_home_score = excluded.predicted_home_score,
      predicted_away_score = excluded.predicted_away_score,
      updated_at = now()
  where pulse_match_predictions.processed_at is null
    and pulse_match_predictions.locked_at is null;

  if not exists (
    select 1 from public.pulse_match_predictions saved
    where saved.user_id = uid
      and saved.match_id = match.id
      and saved.predicted_winner = winner
      and saved.predicted_home_score = p_home_score
      and saved.predicted_away_score = p_away_score
      and saved.locked_at is null
      and saved.processed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. El pronóstico está cerrado.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_matches_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  perform public.pulse_sim_tick();
  perform public.pulse_lock_due_matches();
  uid := public.pulse_user_id(p_token);
  return coalesce((
    select jsonb_agg(row_to_json(item) order by item."startsAt")
    from (
      select
        m.id,
        m.home_team as "homeTeam",
        m.away_team as "awayTeam",
        m.starts_at as "startsAt",
        m.status,
        m.home_score as "homeScore",
        m.away_score as "awayScore",
        m.inning,
        m.half,
        m.outs,
        m.is_featured as featured,
        m.last_event_text as "lastEventText",
        m.is_simulation as simulation,
        m.is_demo as demo,
        (
          select jsonb_build_object(
            'id', p.id,
            'winner', p.predicted_winner,
            'homeScore', p.predicted_home_score,
            'awayScore', p.predicted_away_score,
            'lockedAt', p.locked_at,
            'processed', p.processed_at is not null,
            'voided', p.voided_at is not null,
            'winnerPoints', coalesce(p.points_base, (tx.metadata->>'winnerPoints')::int),
            'closenessPoints', coalesce(p.points_closeness, (tx.metadata->>'closenessPoints')::int),
            'total', coalesce(p.points_total, tx.points),
            'errorTotal', coalesce(p.error_total, (tx.metadata->>'errorTotal')::int),
            'hitWinner', p.hit_winner
          )
          from public.pulse_match_predictions p
          left join public.pulse_transactions tx
            on tx.source_type = 'prediction' and tx.source_id = p.id
          where p.match_id = m.id and p.user_id = uid
        ) as prediction
      from public.pulse_matches m
    ) item
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pulse_score_notice(integer, integer, integer, integer, integer, integer, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.pulse_score_match_rows(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.pulse_score_match_rows(text, integer, integer, text) to service_role;
revoke all on function public.pulse_admin_preview_result(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.pulse_admin_set_result(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.pulse_admin_cancel(text, text) from public, anon, authenticated;

grant execute on function public.pulse_scoring_rules() to anon, authenticated, service_role;
grant execute on function public.pulse_notifications_list(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.pulse_notifications_read(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_notifications_read_all(text) to anon, authenticated, service_role;
grant execute on function public.pulse_admin_preview_result(text, text, integer, integer) to service_role;
grant execute on function public.pulse_admin_set_result(text, text, integer, integer) to service_role;
grant execute on function public.pulse_admin_cancel(text, text) to service_role;
