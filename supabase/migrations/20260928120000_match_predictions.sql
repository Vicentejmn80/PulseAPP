alter table public.pulse_transactions
  add column if not exists metadata jsonb;

create unique index if not exists pulse_transactions_source_unique
  on public.pulse_transactions (source_type, source_id);

create table if not exists public.pulse_matches (
  id text primary key,
  home_team text not null,
  away_team text not null,
  starts_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'locked', 'finished', 'postponed', 'cancelled')),
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team <> away_team)
);

create table if not exists public.pulse_match_predictions (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  match_id text not null references public.pulse_matches (id) on delete cascade,
  predicted_winner text not null,
  predicted_home_score integer not null,
  predicted_away_score integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  unique (user_id, match_id),
  check (predicted_home_score >= 0 and predicted_away_score >= 0),
  check (predicted_home_score <> predicted_away_score)
);

create table if not exists public.pulse_admin_keys (
  id text primary key,
  admin_key text not null
);

insert into public.pulse_admin_keys (id, admin_key)
values ('tobo', 'TOBO-ADMIN')
on conflict (id) do nothing;

alter table public.pulse_matches enable row level security;
alter table public.pulse_match_predictions enable row level security;
alter table public.pulse_admin_keys enable row level security;

create or replace function public.pulse_closeness_points(p_error integer)
returns integer
language sql
immutable
as $$
  select case
    when p_error <= 0 then 40
    when p_error <= 2 then 36
    when p_error <= 4 then 32
    when p_error <= 6 then 28
    when p_error <= 8 then 24
    when p_error <= 10 then 20
    when p_error <= 12 then 16
    when p_error <= 14 then 12
    when p_error <= 16 then 8
    when p_error <= 18 then 4
    else 0
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
immutable
as $$
declare
  pred_winner text;
  actual_winner text;
  winner_points integer;
  error_total integer;
  closeness integer;
begin
  if p_pred_home = p_pred_away or p_actual_home = p_actual_away then
    pred_winner := '';
    actual_winner := '';
  else
    pred_winner := case when p_pred_home > p_pred_away then 'home' else 'away' end;
    actual_winner := case when p_actual_home > p_actual_away then 'home' else 'away' end;
  end if;
  winner_points := case when pred_winner <> '' and pred_winner = actual_winner then 40 else 0 end;
  error_total := abs(p_pred_home - p_actual_home) + abs(p_pred_away - p_actual_away);
  closeness := public.pulse_closeness_points(error_total);
  return jsonb_build_object(
    'winnerPoints', winner_points,
    'closenessPoints', closeness,
    'total', least(80, winner_points + closeness),
    'errorTotal', error_total
  );
end;
$$;

create or replace function public.pulse_lock_due_matches()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pulse_matches
  set status = 'locked', updated_at = now()
  where status = 'scheduled' and starts_at <= now();

  update public.pulse_match_predictions pred
  set locked_at = match.starts_at
  from public.pulse_matches match
  where pred.match_id = match.id
    and pred.locked_at is null
    and (match.status in ('locked', 'finished') or match.starts_at <= now());
end;
$$;

create or replace function public.pulse_user_id(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.pulse_sessions where token = p_token;
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
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para guardar la predicción.');
  end if;
  select * into match from public.pulse_matches where id = p_match_id for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese partido no existe.');
  end if;
  if match.status <> 'scheduled' or match.starts_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'El partido ya comenzó. La predicción está bloqueada.');
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 99 or p_away_score > 99 then
    return jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un número entero entre 0 y 99.');
  end if;
  if p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'En béisbol no se predice empate.');
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
    return jsonb_build_object('ok', false, 'error', 'El partido ya comenzó. La predicción está bloqueada.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_require_admin(p_admin_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.pulse_admin_keys where admin_key = trim(coalesce(p_admin_key, ''))
  ) then
    raise exception 'Clave de admin incorrecta';
  end if;
end;
$$;

create or replace function public.pulse_admin_create_match(
  p_admin_key text,
  p_home text,
  p_away text,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if trim(coalesce(p_home, '')) = '' or trim(coalesce(p_away, '')) = '' or trim(p_home) = trim(p_away) then
    return jsonb_build_object('ok', false, 'error', 'Escribe dos equipos distintos.');
  end if;
  if p_starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'Indica la fecha y hora del partido.');
  end if;
  new_id := 'match_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_matches (id, home_team, away_team, starts_at)
  values (new_id, trim(p_home), trim(p_away), p_starts_at);
  return jsonb_build_object('ok', true, 'id', new_id);
end;
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
  match public.pulse_matches;
  pred public.pulse_match_predictions;
  breakdown jsonb;
  awarded integer := 0;
  scored integer := 0;
  inserted integer;
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_lock_due_matches();
  select * into match from public.pulse_matches where id = p_match_id for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese partido no existe.');
  end if;
  if match.status in ('postponed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'Ese partido no se puede puntuar.');
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'El resultado no puede quedar empatado.');
  end if;

  if match.status = 'finished'
     and (match.home_score is distinct from p_home_score or match.away_score is distinct from p_away_score) then
    return jsonb_build_object('ok', false, 'error', 'Ese partido ya tiene un resultado. No se puede cambiar.');
  end if;

  if match.status <> 'finished' then
    update public.pulse_matches
    set home_score = p_home_score,
        away_score = p_away_score,
        status = 'finished',
        updated_at = now()
    where id = match.id;
  end if;

  for pred in
    select * from public.pulse_match_predictions
    where match_id = match.id and processed_at is null
    for update
  loop
    breakdown := public.pulse_score_breakdown(
      pred.predicted_home_score,
      pred.predicted_away_score,
      p_home_score,
      p_away_score
    );
    insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
    values (
      'tx_' || pred.id,
      pred.user_id,
      'exp_tobo',
      'prediction',
      pred.id,
      (breakdown->>'total')::int,
      breakdown || jsonb_build_object('matchId', match.id, 'homeScore', p_home_score, 'awayScore', p_away_score)
    )
    on conflict (source_type, source_id) do nothing;
    get diagnostics inserted = row_count;
    update public.pulse_match_predictions
    set processed_at = now(),
        locked_at = coalesce(locked_at, match.starts_at)
    where id = pred.id and processed_at is null;
    if inserted > 0 then
      scored := scored + 1;
      awarded := awarded + (breakdown->>'total')::int;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'scored', scored, 'points', awarded);
end;
$$;

create or replace function public.pulse_ranking(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', ranked.position,
      'points', ranked.points,
      'isCurrentUser', ranked.id = uid,
      'user', jsonb_build_object(
        'id', ranked.id,
        'alias', ranked.alias,
        'handle', ranked.handle,
        'initials', ranked.initials,
        'avatarColor', ranked.avatar_color
      )
    ) order by ranked.position)
    from (
      select
        profile.id,
        profile.alias,
        profile.handle,
        profile.initials,
        profile.avatar_color,
        coalesce(sum(tx.points), 0)::int as points,
        row_number() over (order by coalesce(sum(tx.points), 0) desc, profile.alias asc) as position
      from public.pulse_profiles profile
      left join public.pulse_transactions tx on tx.user_id = profile.id
      group by profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color
    ) ranked
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.pulse_closeness_points(integer) to anon, authenticated;
grant execute on function public.pulse_score_breakdown(integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.pulse_matches_list(text) to anon, authenticated;
grant execute on function public.pulse_save_prediction(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.pulse_admin_create_match(text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.pulse_admin_set_result(text, text, integer, integer) to anon, authenticated;
grant execute on function public.pulse_ranking(text) to anon, authenticated;

create or replace function public.pulse_snapshot(p_user_id text, p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.pulse_profiles;
begin
  select * into me from public.pulse_profiles where id = p_user_id;
  if me.id is null then
    return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', p_token,
    'currentUser', public.pulse_profile_private(me),
    'users', coalesce((
      select jsonb_agg(public.pulse_public_profile(p) order by p.created_at)
      from public.pulse_profiles p
    ), '[]'::jsonb),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', part.id,
        'userId', part.user_id,
        'experienceId', part.experience_id,
        'gameId', part.game_id,
        'type', part.type,
        'createdAt', to_char(part.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'metadata', part.metadata
      ) order by part.created_at)
      from public.pulse_participations part
      where part.user_id = p_user_id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tx.id,
        'userId', tx.user_id,
        'experienceId', tx.experience_id,
        'sourceType', tx.source_type,
        'sourceId', tx.source_id,
        'points', tx.points,
        'createdAt', to_char(tx.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'metadata', tx.metadata
      ) order by tx.created_at)
      from public.pulse_transactions tx
      where tx.user_id = p_user_id
    ), '[]'::jsonb),
    'completedMissionIds', coalesce((
      select jsonb_agg(cm.mission_id)
      from public.pulse_completed_missions cm
      where cm.user_id = p_user_id
    ), '[]'::jsonb),
    'predictionPicks', coalesce((
      select jsonb_object_agg(pp.game_id, pp.option_id)
      from public.pulse_prediction_picks pp
      where pp.user_id = p_user_id
    ), '{}'::jsonb),
    'extraGames', coalesce((
      select jsonb_agg(eg.game order by eg.id)
      from public.pulse_extra_games eg
    ), '[]'::jsonb)
  );
end;
$$;
