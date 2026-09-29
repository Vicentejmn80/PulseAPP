-- Coarse live state for one featured game: score, outs, half, and a short log.
-- A practice game uses id sim_% and never enters the ranking, the October list, or the pleno.

alter table public.pulse_matches
  add column if not exists is_featured boolean not null default false,
  add column if not exists outs integer not null default 0,
  add column if not exists last_event_text text not null default '';

alter table public.pulse_matches drop constraint if exists pulse_matches_outs_check;
alter table public.pulse_matches
  add constraint pulse_matches_outs_check check (outs between 0 and 2);

create unique index if not exists pulse_one_featured_live
  on public.pulse_matches ((1))
  where is_featured and status = 'in_progress';

create table if not exists public.pulse_match_live_log (
  id text primary key,
  match_id text not null references public.pulse_matches (id) on delete cascade,
  event_type text not null check (event_type in ('run_home', 'run_away', 'out', 'inning_change', 'final')),
  home_score_after integer not null check (home_score_after >= 0),
  away_score_after integer not null check (away_score_after >= 0),
  inning_after integer not null check (inning_after between 1 and 30),
  half_after text not null check (half_after in ('alta', 'baja')),
  outs_after integer not null default 0 check (outs_after between 0 and 2),
  inning_of integer not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists pulse_match_live_log_match_idx
  on public.pulse_match_live_log (match_id, created_at desc);

alter table public.pulse_match_live_log enable row level security;

alter table public.pulse_live_questions
  add column if not exists inning integer,
  add column if not exists kind text;

insert into public.pulse_pilot_config (key, value)
values ('INNING_QUESTION', '"runs"')
on conflict (key) do nothing;

create or replace function public.pulse_inning_kind()
returns text
language sql
stable
as $$
  select case
    when coalesce((select value #>> '{}' from public.pulse_pilot_config where key = 'INNING_QUESTION'), 'runs') in ('runs', 'count', 'first')
      then (select value #>> '{}' from public.pulse_pilot_config where key = 'INNING_QUESTION')
    else 'runs'
  end;
$$;

create or replace function public.pulse_open_inning_question(p_match text, p_inning integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  kind text := public.pulse_inning_kind();
  prompt text;
  options jsonb;
begin
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null or p_inning is null or p_inning < 1 then
    return;
  end if;
  if exists (
    select 1 from public.pulse_live_questions
    where match_id = p_match and inning = p_inning and status = 'open'
  ) then
    return;
  end if;
  if kind = 'count' then
    prompt := '¿Cuántas carreras habrá en este inning?';
    options := '[{"id":"0","label":"0"},{"id":"1","label":"1"},{"id":"2","label":"2"},{"id":"3","label":"3+"}]'::jsonb;
  elsif kind = 'first' then
    prompt := '¿Quién anota primero en este inning?';
    options := jsonb_build_array(
      jsonb_build_object('id', 'local', 'label', match.home_team),
      jsonb_build_object('id', 'visitante', 'label', match.away_team),
      jsonb_build_object('id', 'nadie', 'label', 'Nadie')
    );
  else
    kind := 'runs';
    prompt := '¿Anotan carreras en este inning?';
    options := '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb;
  end if;
  insert into public.pulse_live_questions (id, match_id, prompt, options, status, closes_at, inning, kind)
  values (
    'inn_' || p_match || '_' || p_inning || '_' || kind,
    p_match, prompt, options, 'open', null, p_inning, kind
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function public.pulse_resolve_inning_question(p_match text, p_inning integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  q public.pulse_live_questions;
  ans record;
  home_runs integer := 0;
  away_runs integer := 0;
  total integer := 0;
  first_run text;
  correct text;
  points integer := public.pulse_cfg_int('LIVE_POINTS');
begin
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return;
  end if;
  select
    count(*) filter (where event_type = 'run_home'),
    count(*) filter (where event_type = 'run_away')
  into home_runs, away_runs
  from public.pulse_match_live_log
  where match_id = p_match and inning_of = p_inning;
  total := coalesce(home_runs, 0) + coalesce(away_runs, 0);
  select event_type into first_run
  from public.pulse_match_live_log
  where match_id = p_match
    and inning_of = p_inning
    and event_type in ('run_home', 'run_away')
  order by created_at
  limit 1;

  for q in
    select * from public.pulse_live_questions
    where match_id = p_match and inning = p_inning and status = 'open'
    for update
  loop
    correct := case coalesce(q.kind, 'runs')
      when 'count' then case when total >= 3 then '3' when total = 2 then '2' when total = 1 then '1' else '0' end
      when 'first' then case first_run when 'run_home' then 'local' when 'run_away' then 'visitante' else 'nadie' end
      else case when total > 0 then 'si' else 'no' end
    end;
    update public.pulse_live_questions
    set status = 'resolved', correct_option = correct, resolved_at = now()
    where id = q.id;
    for ans in select * from public.pulse_live_answers where question_id = q.id loop
      if ans.option_id = correct then
        perform public.pulse_credit(
          ans.user_id, 'live_answer', ans.id, points,
          jsonb_build_object(
            'earnedOn', (match.starts_at at time zone 'America/Caracas')::date,
            'matchId', match.id
          )
        );
      else
        perform public.pulse_credit(
          ans.user_id, 'live_answer', ans.id, 0,
          jsonb_build_object('matchId', match.id)
        );
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.pulse_live_apply(p_match text, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  next_home integer;
  next_away integer;
  next_inning integer;
  next_half text;
  next_outs integer;
  event_type text;
  note text;
  inning_of integer;
  advanced boolean := false;
begin
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no está en vivo.');
  end if;
  if p_action not in ('run_home', 'run_away', 'out', 'inning_change') then
    return jsonb_build_object('ok', false, 'error', 'Esa acción no existe.');
  end if;

  next_home := coalesce(match.home_score, 0);
  next_away := coalesce(match.away_score, 0);
  next_inning := greatest(coalesce(match.inning, 1), 1);
  next_half := case when match.half = 'baja' then 'baja' else 'alta' end;
  next_outs := least(2, greatest(coalesce(match.outs, 0), 0));
  inning_of := next_inning;

  if p_action = 'run_home' then
    next_home := next_home + 1;
    event_type := 'run_home';
    note := '¡Carrera de ' || match.home_team || '!';
  elsif p_action = 'run_away' then
    next_away := next_away + 1;
    event_type := 'run_away';
    note := '¡Carrera de ' || match.away_team || '!';
  elsif p_action = 'out' and next_outs < 2 then
    next_outs := next_outs + 1;
    event_type := 'out';
    note := 'Out';
  else
    event_type := 'inning_change';
    next_outs := 0;
    if next_half = 'alta' then
      next_half := 'baja';
      note := 'Empieza la baja';
    else
      next_half := 'alta';
      next_inning := next_inning + 1;
      advanced := true;
      note := 'Empieza el inning ' || next_inning;
    end if;
    if p_action = 'out' then
      note := 'Tercer out. ' || note;
    end if;
  end if;

  update public.pulse_matches
  set home_score = next_home,
      away_score = next_away,
      inning = next_inning,
      half = next_half,
      outs = next_outs,
      last_event_text = note,
      updated_at = now()
  where id = match.id;

  insert into public.pulse_match_live_log (
    id, match_id, event_type, home_score_after, away_score_after,
    inning_after, half_after, outs_after, inning_of, note
  ) values (
    'log_' || replace(gen_random_uuid()::text, '-', ''),
    match.id, event_type, next_home, next_away,
    next_inning, next_half, next_outs, inning_of, note
  );

  if p_action in ('run_home', 'run_away') and inning_of = 1 then
    perform public.pulse_bingo_mark(match.id, 'carrera_1er');
  end if;
  if advanced then
    perform public.pulse_resolve_inning_question(match.id, inning_of);
    perform public.pulse_open_inning_question(match.id, next_inning);
  end if;

  return jsonb_build_object(
    'ok', true,
    'reports', (select count(*) from public.pulse_match_live_log where match_id = match.id),
    'homeScore', next_home,
    'awayScore', next_away,
    'inning', next_inning,
    'half', next_half,
    'outs', next_outs,
    'lastEventText', note,
    'homeTeam', match.home_team,
    'awayTeam', match.away_team,
    'simulation', match.is_simulation
  );
end;
$$;

create or replace function public.pulse_admin_feature_live(p_admin_key text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  other public.pulse_matches;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status in ('finished', 'cancelled') or match.is_simulation then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no se puede abrir como estelar.');
  end if;
  select * into other
  from public.pulse_matches
  where is_featured and status = 'in_progress' and id <> match.id
  limit 1;
  if other.id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya está en vivo ' || other.away_team || ' vs ' || other.home_team || '. Quítalo de estelar antes de abrir otro.'
    );
  end if;
  update public.pulse_matches
  set is_featured = true,
      status = 'in_progress',
      home_score = coalesce(home_score, 0),
      away_score = coalesce(away_score, 0),
      inning = greatest(coalesce(inning, 1), 1),
      half = case when half = 'baja' then 'baja' else 'alta' end,
      outs = 0,
      last_event_text = 'Juego estelar en vivo',
      updated_at = now()
  where id = match.id;
  perform public.pulse_open_inning_question(match.id, greatest(coalesce(match.inning, 1), 1));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_unfeature(p_admin_key text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_matches
  set is_featured = false,
      status = case
        when status <> 'in_progress' then status
        when starts_at > now() then 'scheduled'
        else 'locked'
      end,
      updated_at = now()
  where id = p_match and not is_simulation;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no está como estelar.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_reporter_state(p_admin_key text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'homeTeam', match.home_team,
    'awayTeam', match.away_team,
    'homeScore', coalesce(match.home_score, 0),
    'awayScore', coalesce(match.away_score, 0),
    'inning', match.inning,
    'half', match.half,
    'outs', match.outs,
    'status', match.status,
    'featured', match.is_featured,
    'simulation', match.is_simulation,
    'lastEventText', match.last_event_text,
    'reports', (select count(*) from public.pulse_match_live_log where match_id = match.id)
  );
end;
$$;

create or replace function public.pulse_reporter_tap(p_admin_key text, p_match text, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return public.pulse_live_apply(p_match, p_action);
end;
$$;

create or replace function public.pulse_reporter_finish(p_admin_key text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  scored jsonb;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status = 'finished' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if match.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'error', 'Primero abre el juego en vivo.');
  end if;
  if coalesce(match.home_score, 0) = coalesce(match.away_score, 0) then
    return jsonb_build_object('ok', false, 'error', 'El marcador no puede quedar empatado.');
  end if;
  perform public.pulse_resolve_inning_question(match.id, match.inning);
  insert into public.pulse_match_live_log (
    id, match_id, event_type, home_score_after, away_score_after,
    inning_after, half_after, outs_after, inning_of, note
  ) values (
    'log_' || replace(gen_random_uuid()::text, '-', ''),
    match.id, 'final', coalesce(match.home_score, 0), coalesce(match.away_score, 0),
    match.inning, match.half, match.outs, match.inning, 'Final'
  );
  if match.is_simulation then
    perform public.pulse_score_match_now(match.id);
    perform public.pulse_resolve_duels(match.id);
    update public.pulse_matches
    set status = 'finished', is_featured = false, last_event_text = 'Final', updated_at = now()
    where id = match.id;
    update public.pulse_simulations set status = 'stopped' where match_id = match.id;
  else
    scored := public.pulse_admin_set_result(p_admin_key, match.id, coalesce(match.home_score, 0), coalesce(match.away_score, 0));
    if coalesce(scored->>'ok', 'false') <> 'true' then
      return scored;
    end if;
    update public.pulse_matches
    set is_featured = false, last_event_text = 'Final', updated_at = now()
    where id = match.id;
  end if;
  return jsonb_build_object('ok', true, 'reports', (select count(*) from public.pulse_match_live_log where match_id = match.id));
end;
$$;

create or replace function public.pulse_admin_set_inning_kind(p_admin_key text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  kind text := case when p_kind in ('runs', 'count', 'first') then p_kind else 'runs' end;
begin
  perform public.pulse_require_admin(p_admin_key);
  insert into public.pulse_pilot_config (key, value)
  values ('INNING_QUESTION', to_jsonb(kind))
  on conflict (key) do update set value = excluded.value;
  select * into match
  from public.pulse_matches
  where is_featured and status = 'in_progress'
  order by updated_at desc
  limit 1;
  if match.id is not null and not exists (
    select 1 from public.pulse_live_questions
    where match_id = match.id and inning = match.inning and status = 'open'
  ) then
    perform public.pulse_open_inning_question(match.id, match.inning);
  end if;
  return jsonb_build_object('ok', true, 'kind', kind);
end;
$$;

create or replace function public.pulse_sim_script()
returns jsonb
language sql
immutable
as $$
  select '["out","out","run_away","out","out","run_home","out","out","out","out","out","run_home","out","out"]'::jsonb;
$$;

create or replace function public.pulse_sim_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sim public.pulse_simulations;
  script jsonb;
  action text;
  applied jsonb;
begin
  for sim in
    select * from public.pulse_simulations
    where status = 'running' and next_at <= now()
    for update
  loop
    script := public.pulse_sim_script();
    if sim.step >= jsonb_array_length(script) then
      update public.pulse_simulations set status = 'stopped' where match_id = sim.match_id;
      continue;
    end if;
    action := script ->> sim.step;
    applied := public.pulse_live_apply(sim.match_id, action);
    if coalesce(applied->>'ok', 'false') <> 'true' then
      update public.pulse_simulations set status = 'stopped' where match_id = sim.match_id;
      continue;
    end if;
    update public.pulse_simulations
    set step = sim.step + 1,
        next_at = now() + make_interval(secs => sim.interval_seconds)
    where match_id = sim.match_id;
    if sim.step + 1 >= jsonb_array_length(script) then
      update public.pulse_simulations set status = 'stopped' where match_id = sim.match_id;
    end if;
  end loop;
end;
$$;

create or replace function public.pulse_admin_sim_start(p_admin_key text, p_token text, p_interval integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  seconds integer;
  other public.pulse_matches;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into other
  from public.pulse_matches
  where is_featured and status = 'in_progress' and not is_simulation
  limit 1;
  if other.id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya está en vivo ' || other.away_team || ' vs ' || other.home_team || '. Quítalo de estelar antes de simular.'
    );
  end if;
  perform public.pulse_sim_clear();
  uid := public.pulse_user_id(p_token);
  seconds := least(180, greatest(15, coalesce(p_interval, 120)));
  insert into public.pulse_matches (
    id, home_team, away_team, starts_at, status,
    home_score, away_score, inning, half, outs, is_simulation, is_featured, last_event_text
  ) values (
    'sim_live', 'Navegantes del Magallanes', 'Leones del Caracas', now(), 'in_progress',
    0, 0, 1, 'alta', 0, true, true, 'Simulación en vivo'
  );
  insert into public.pulse_simulations (match_id, status, interval_seconds, next_at, step, user_id)
  values ('sim_live', 'running', seconds, now(), 0, uid);
  if uid is not null then
    insert into public.pulse_match_predictions (
      id, user_id, match_id, predicted_winner, predicted_home_score, predicted_away_score, locked_at
    ) values (
      'pred_sim_live_' || replace(uid, 'user_', ''), uid, 'sim_live', 'Navegantes del Magallanes', 2, 1, now()
    )
    on conflict (user_id, match_id) do nothing;
    insert into public.pulse_bingo_cards (id, match_id, user_id, picks)
    values (
      'bingo_sim_' || replace(uid, 'user_', ''),
      'sim_live', uid,
      array['carrera_1er', 'jonron', 'ponche', 'doble_play', 'error']
    )
    on conflict (match_id, user_id) do nothing;
  end if;
  perform public.pulse_open_inning_question('sim_live', 1);
  return jsonb_build_object('ok', true, 'matchId', 'sim_live', 'seconds', seconds);
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
        (
          select jsonb_build_object(
            'id', p.id,
            'winner', p.predicted_winner,
            'homeScore', p.predicted_home_score,
            'awayScore', p.predicted_away_score,
            'lockedAt', p.locked_at,
            'processed', p.processed_at is not null,
            'winnerPoints', (tx.metadata->>'winnerPoints')::int,
            'closenessPoints', (tx.metadata->>'closenessPoints')::int,
            'total', tx.points,
            'errorTotal', (tx.metadata->>'errorTotal')::int
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

create or replace function public.pulse_match_center(p_token text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  pred public.pulse_match_predictions;
  breakdown jsonb;
  mood text;
  minimum integer := public.pulse_cfg_int('SOCIAL_MIN');
  pick_total integer;
  question jsonb;
  swings integer := 0;
  momentum integer := 50;
begin
  perform public.pulse_sim_tick();
  uid := public.pulse_user_id(p_token);
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  select * into pred from public.pulse_match_predictions where match_id = match.id and user_id = uid;
  if pred.id is not null and match.home_score is not null and match.away_score is not null then
    breakdown := public.pulse_score_breakdown(
      pred.predicted_home_score, pred.predicted_away_score, match.home_score, match.away_score
    );
    mood := case when (breakdown->>'errorTotal')::int <= 4 then 'cerca' else 'lejos' end;
  end if;
  select count(*) into swings
  from public.pulse_match_live_log
  where match_id = match.id and event_type in ('out', 'inning_change');
  momentum := least(94, greatest(8, 50 + (coalesce(match.home_score, 0) + coalesce(match.away_score, 0)) * 12 - swings * 8));
  select count(*) into pick_total from public.pulse_match_predictions where match_id = match.id;

  select coalesce(jsonb_agg(row_to_json(q) order by q."createdAt" desc), '[]'::jsonb) into question
  from (
    select
      live.id,
      live.prompt,
      live.options,
      live.status,
      live.closes_at as "closesAt",
      live.created_at as "createdAt",
      answer.option_id as "myOption",
      case when live.status in ('resolved', 'void') then live.correct_option else null end as "correctOption",
      tx.points,
      public.pulse_cfg_int('LIVE_POINTS') as "livePoints",
      case
        when answer.option_id is null then null
        when (select count(*) from public.pulse_live_answers where question_id = live.id) < minimum then jsonb_build_object('hidden', true)
        else jsonb_build_object(
          'total', (select count(*) from public.pulse_live_answers where question_id = live.id),
          'options', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', choice.id,
              'label', choice.label,
              'percent', round(100.0 * (
                select count(*) from public.pulse_live_answers ans
                where ans.question_id = live.id and ans.option_id = choice.id
              ) / nullif((select count(*) from public.pulse_live_answers where question_id = live.id), 0))
            )), '[]'::jsonb)
            from jsonb_to_recordset(live.options) as choice(id text, label text)
          )
        )
      end as share
    from public.pulse_live_questions live
    left join public.pulse_live_answers answer on answer.question_id = live.id and answer.user_id = uid
    left join public.pulse_transactions tx on tx.source_type = 'live_answer' and tx.source_id = answer.id
    where live.match_id = match.id
      and live.status <> 'draft'
      and (live.status = 'open' or live.created_at > now() - interval '18 hours')
  ) q;

  return jsonb_build_object(
    'ok', true,
    'match', jsonb_build_object(
      'id', match.id,
      'awayTeam', match.away_team,
      'homeTeam', match.home_team,
      'homeScore', match.home_score,
      'awayScore', match.away_score,
      'inning', match.inning,
      'half', match.half,
      'outs', match.outs,
      'featured', match.is_featured,
      'momentum', momentum,
      'lastEventText', match.last_event_text,
      'status', match.status,
      'simulation', match.is_simulation,
      'startsAt', match.starts_at
    ),
    'prediction', case when pred.id is null then null else jsonb_build_object(
      'winner', pred.predicted_winner,
      'homeScore', pred.predicted_home_score,
      'awayScore', pred.predicted_away_score
    ) end,
    'closeness', breakdown || jsonb_build_object('mood', mood),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'inning', event.inning_after,
        'half', event.half_after,
        'type', event.event_type,
        'description', event.note,
        'homeScore', event.home_score_after,
        'awayScore', event.away_score_after,
        'createdAt', event.created_at
      ) order by event.created_at desc)
      from public.pulse_match_live_log event
      where event.match_id = match.id
    ), '[]'::jsonb),
    'bingo', jsonb_build_object(
      'points', coalesce((
        select sum(tx.points)
        from public.pulse_transactions tx
        where tx.user_id = uid and tx.source_type = 'bingo' and tx.metadata->>'matchId' = match.id
      ), 0),
      'picks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pick.pick_id,
          'label', coalesce(catalog.label, pick.pick_id),
          'resolvedAt', hit.resolved_at
        ) order by pick.ordinality)
        from public.pulse_bingo_cards card
        cross join lateral unnest(card.picks) with ordinality as pick(pick_id, ordinality)
        left join public.pulse_bingo_events catalog on catalog.id = pick.pick_id
        left join public.pulse_bingo_hits hit
          on hit.match_id = match.id and hit.user_id = uid and hit.pick_id = pick.pick_id
        where card.match_id = match.id and card.user_id = uid
      ), '[]'::jsonb)
    ),
    'live', coalesce(question, '[]'::jsonb),
    'winnerShare', case
      when match.status not in ('scheduled', 'postponed') or match.starts_at <= now() then null
      when pick_total < minimum then jsonb_build_object('hidden', true, 'total', pick_total)
      else jsonb_build_object(
        'total', pick_total,
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'team', side.team,
            'percent', round(100.0 * side.votes / pick_total)
          )), '[]'::jsonb)
          from (
            select predicted_winner as team, count(*) as votes
            from public.pulse_match_predictions
            where match_id = match.id
            group by predicted_winner
          ) side
        )
      )
    end,
    'duels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', duel.id,
        'status', duel.status,
        'opponent', other.alias,
        'mine', case when duel.challenger_id = uid then duel.challenger_points else duel.opponent_points end,
        'theirs', case when duel.challenger_id = uid then duel.opponent_points else duel.challenger_points end,
        'iWon', duel.winner_user_id = uid,
        'tie', duel.status = 'resolved' and duel.winner_user_id is null
      ))
      from public.pulse_duels duel
      join public.pulse_profiles other on other.id = case when duel.challenger_id = uid then duel.opponent_id else duel.challenger_id end
      where duel.match_id = match.id and (duel.challenger_id = uid or duel.opponent_id = uid)
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.pulse_admin_feature_live(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_unfeature(text, text) to anon, authenticated;
grant execute on function public.pulse_reporter_state(text, text) to anon, authenticated;
grant execute on function public.pulse_reporter_tap(text, text, text) to anon, authenticated;
grant execute on function public.pulse_reporter_finish(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_set_inning_kind(text, text) to anon, authenticated;
