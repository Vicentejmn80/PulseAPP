-- October 2026 Juégate el Tobo: PDF scoring bands, cycles, venues, prizes,
-- and the published LVBP calendar. Home team is the stadium club.
-- Source: DiarioVea, 19 Sep 2026, cross-checked with El Diario, 18 Sep 2026.
-- Oct 30 uses three games (Leones at Bravos, Magallanes at Caribes, Águilas at Tiburones).
-- Oct 31 uses DiarioVea so each club plays once.

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

create or replace function public.pulse_lock_due_matches()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pulse_matches
  set status = 'locked', updated_at = now()
  where status in ('scheduled', 'postponed')
    and starts_at <= now();

  update public.pulse_match_predictions pred
  set locked_at = match.starts_at
  from public.pulse_matches match
  where pred.match_id = match.id
    and pred.locked_at is null
    and pred.processed_at is null
    and match.status <> 'cancelled'
    and (match.status in ('locked', 'finished') or match.starts_at <= now());
end;
$$;

alter table public.pulse_profiles
  add column if not exists prize_eligible boolean not null default true;

create table if not exists public.pulse_cycles (
  id text primary key,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed'))
);

insert into public.pulse_cycles (id, name, starts_on, ends_on)
values
  ('ronda_1', 'Ronda 1', '2026-10-12', '2026-10-16'),
  ('ronda_2', 'Ronda 2', '2026-10-17', '2026-10-23'),
  ('ronda_3', 'Ronda 3', '2026-10-24', '2026-10-30')
on conflict (id) do nothing;

create table if not exists public.pulse_venues (
  id text primary key,
  name text not null,
  zone text not null default '',
  address text not null default '',
  contact text not null default '',
  is_founder boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_prizes (
  id text primary key,
  cycle_id text not null references public.pulse_cycles (id),
  rank_slot integer not null check (rank_slot between 1 and 3),
  winner_user_id text not null references public.pulse_profiles (id),
  redemption_code text not null unique,
  status text not null default 'assigned' check (status in ('assigned', 'redeemed', 'expired')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  unique (cycle_id, rank_slot)
);

alter table public.pulse_cycles enable row level security;
alter table public.pulse_venues enable row level security;
alter table public.pulse_prizes enable row level security;

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
  if match.status in ('finished', 'cancelled', 'locked') or match.starts_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. El pronóstico está cerrado.');
  end if;
  if match.status not in ('scheduled', 'postponed') then
    return jsonb_build_object('ok', false, 'error', 'Este juego no está abierto para pronosticar.');
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 99 or p_away_score > 99 then
    return jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un número entero entre 0 y 99.');
  end if;
  if p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'En béisbol no se pronostica empate.');
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
  same_result boolean;
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_lock_due_matches();
  select * into match from public.pulse_matches where id = p_match_id for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status in ('cancelled') then
    return jsonb_build_object('ok', false, 'error', 'Un juego cancelado no otorga puntos.');
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'El resultado no puede quedar empatado.');
  end if;

  same_result := match.status = 'finished'
    and match.home_score = p_home_score
    and match.away_score = p_away_score;

  if not same_result then
    update public.pulse_matches
    set home_score = p_home_score,
        away_score = p_away_score,
        status = 'finished',
        updated_at = now()
    where id = match.id;
  end if;

  for pred in
    select * from public.pulse_match_predictions
    where match_id = match.id
      and (processed_at is null or not same_result)
    for update
  loop
    breakdown := public.pulse_score_breakdown(
      pred.predicted_home_score,
      pred.predicted_away_score,
      p_home_score,
      p_away_score
    ) || jsonb_build_object(
      'matchId', match.id,
      'homeScore', p_home_score,
      'awayScore', p_away_score,
      'matchStartsAt', match.starts_at
    );
    insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
    values (
      'tx_' || pred.id,
      pred.user_id,
      'exp_tobo',
      'prediction',
      pred.id,
      (breakdown->>'total')::int,
      breakdown
    )
    on conflict (source_type, source_id) do update
    set points = excluded.points,
        metadata = excluded.metadata || jsonb_build_object('correctedAt', now())
    where public.pulse_transactions.points is distinct from excluded.points
       or public.pulse_transactions.metadata->>'homeScore' is distinct from excluded.metadata->>'homeScore'
       or public.pulse_transactions.metadata->>'awayScore' is distinct from excluded.metadata->>'awayScore';
    if found then
      scored := scored + 1;
      awarded := awarded + (breakdown->>'total')::int;
    end if;
    update public.pulse_match_predictions
    set processed_at = coalesce(processed_at, now()),
        locked_at = coalesce(locked_at, match.starts_at)
    where id = pred.id;
  end loop;

  return jsonb_build_object('ok', true, 'scored', scored, 'points', awarded);
end;
$$;

create or replace function public.pulse_admin_postpone(
  p_admin_key text,
  p_match_id text,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  if p_starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'Indica la nueva hora.');
  end if;
  update public.pulse_matches
  set starts_at = p_starts_at,
      status = 'postponed',
      updated_at = now()
  where id = p_match_id
    and status <> 'finished'
    and status <> 'cancelled';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no se puede posponer.');
  end if;
  update public.pulse_match_predictions
  set locked_at = null
  where match_id = p_match_id
    and processed_at is null;
  perform public.pulse_lock_due_matches();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_cancel(p_admin_key text, p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into match from public.pulse_matches where id = p_match_id for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status = 'finished' then
    return jsonb_build_object('ok', false, 'error', 'Ese juego ya tiene resultado oficial.');
  end if;
  update public.pulse_matches
  set status = 'cancelled', updated_at = now()
  where id = match.id;
  update public.pulse_match_predictions
  set processed_at = coalesce(processed_at, now()),
      locked_at = coalesce(locked_at, now())
  where match_id = match.id;
  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.pulse_ranking(text);

create or replace function public.pulse_ranking(p_token text, p_cycle text default 'lifetime')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  c_start date;
  c_end date;
begin
  uid := public.pulse_user_id(p_token);
  if p_cycle is null or p_cycle = 'lifetime' then
    c_start := null;
    c_end := null;
  else
    select starts_on, ends_on into c_start, c_end
    from public.pulse_cycles
    where id = p_cycle;
    if c_start is null then
      return '[]'::jsonb;
    end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', ranked.position,
      'points', ranked.points,
      'lifetimePoints', ranked.lifetime_points,
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
        coalesce(sum(tx.points) filter (
          where c_start is null
             or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end
        ), 0)::int as points,
        coalesce(sum(tx.points), 0)::int as lifetime_points,
        coalesce(sum(tx.points) filter (
          where tx.source_type = 'prediction'
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        ), 0)::int as prediction_points,
        count(*) filter (
          where tx.source_type = 'prediction'
            and (tx.metadata->>'errorTotal')::int = 0
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        )::int as exacts,
        count(*) filter (
          where tx.source_type = 'prediction'
            and (tx.metadata->>'winnerPoints')::int = 40
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        )::int as winners,
        (
          select max(pred.updated_at)
          from public.pulse_match_predictions pred
          join public.pulse_matches pred_match on pred_match.id = pred.match_id
          where pred.user_id = profile.id
            and (
              c_start is null
              or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end
            )
        ) as last_prediction_at,
        row_number() over (
          order by
            coalesce(sum(tx.points) filter (
              where c_start is null
                 or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end
            ), 0) desc,
            coalesce(sum(tx.points) filter (
              where tx.source_type = 'prediction'
                and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
            ), 0) desc,
            count(*) filter (
              where tx.source_type = 'prediction'
                and (tx.metadata->>'errorTotal')::int = 0
                and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
            ) desc,
            count(*) filter (
              where tx.source_type = 'prediction'
                and (tx.metadata->>'winnerPoints')::int = 40
                and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
            ) desc,
            (
              select max(pred.updated_at)
              from public.pulse_match_predictions pred
              join public.pulse_matches pred_match on pred_match.id = pred.match_id
              where pred.user_id = profile.id
                and (
                  c_start is null
                  or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end
                )
            ) asc nulls last,
            profile.alias asc
        ) as position
      from public.pulse_profiles profile
      left join public.pulse_transactions tx on tx.user_id = profile.id
      left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
      group by profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color
    ) ranked
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_cycles_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'startsOn', starts_on,
    'endsOn', ends_on,
    'status', status
  ) order by starts_on), '[]'::jsonb)
  from public.pulse_cycles;
$$;

create or replace function public.pulse_venues_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'zone', zone,
    'address', address,
    'contact', contact,
    'isFounder', is_founder
  ) order by is_founder desc, name), '[]'::jsonb)
  from public.pulse_venues
  where active;
$$;

create or replace function public.pulse_my_prizes(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  eligible boolean;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('eligible', false, 'prizes', '[]'::jsonb);
  end if;
  select prize_eligible into eligible from public.pulse_profiles where id = uid;
  return jsonb_build_object(
    'eligible', coalesce(eligible, false),
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prize.id,
        'cycleId', prize.cycle_id,
        'cycleName', cycle.name,
        'rank', prize.rank_slot,
        'code', prize.redemption_code,
        'status', prize.status,
        'expiresAt', prize.expires_at
      ) order by cycle.starts_on)
      from public.pulse_prizes prize
      join public.pulse_cycles cycle on cycle.id = prize.cycle_id
      where prize.winner_user_id = uid
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_admin_save_venue(
  p_admin_key text,
  p_name text,
  p_zone text,
  p_address text,
  p_contact text,
  p_founder boolean
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
  if length(trim(coalesce(p_name, ''))) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre de la tasca.');
  end if;
  new_id := 'venue_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_venues (id, name, zone, address, contact, is_founder)
  values (new_id, trim(p_name), trim(coalesce(p_zone, '')), trim(coalesce(p_address, '')), trim(coalesce(p_contact, '')), coalesce(p_founder, false));
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

create or replace function public.pulse_admin_close_round(p_admin_key text, p_cycle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ranked record;
  slot integer := 0;
  code text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if not exists (select 1 from public.pulse_cycles where id = p_cycle) then
    return jsonb_build_object('ok', false, 'error', 'Esa ronda no existe.');
  end if;
  if exists (select 1 from public.pulse_prizes where cycle_id = p_cycle) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  for ranked in
    select item->'user'->>'id' as user_id, (item->>'points')::int as points
    from jsonb_array_elements(public.pulse_ranking('', p_cycle)) item
    join public.pulse_profiles profile on profile.id = item->'user'->>'id'
    where profile.prize_eligible
      and (item->>'points')::int > 0
    order by (item->>'position')::int
    limit 3
  loop
    slot := slot + 1;
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.pulse_prizes (id, cycle_id, rank_slot, winner_user_id, redemption_code, expires_at)
    values (
      'prize_' || p_cycle || '_' || slot,
      p_cycle,
      slot,
      ranked.user_id,
      code,
      now() + interval '14 days'
    );
    update public.pulse_profiles set prize_eligible = false where id = ranked.user_id;
  end loop;

  update public.pulse_cycles set status = 'closed' where id = p_cycle;
  return jsonb_build_object('ok', true, 'awarded', slot);
end;
$$;

create or replace function public.pulse_admin_redeem(p_admin_key text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prize public.pulse_prizes;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into prize from public.pulse_prizes where redemption_code = upper(trim(coalesce(p_code, ''))) for update;
  if prize.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese código no existe.');
  end if;
  if prize.status = 'redeemed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  update public.pulse_prizes
  set status = 'redeemed', redeemed_at = now()
  where id = prize.id;
  return jsonb_build_object('ok', true, 'already', false);
end;
$$;

grant execute on function public.pulse_ranking(text, text) to anon, authenticated;
grant execute on function public.pulse_cycles_list() to anon, authenticated;
grant execute on function public.pulse_venues_list() to anon, authenticated;
grant execute on function public.pulse_my_prizes(text) to anon, authenticated;
grant execute on function public.pulse_admin_postpone(text, text, timestamptz) to anon, authenticated;
grant execute on function public.pulse_admin_cancel(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_save_venue(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.pulse_admin_close_round(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_redeem(text, text) to anon, authenticated;

-- Published LVBP October 2026 schedule. Visitor, home, Caracas time.
insert into public.pulse_matches (id, away_team, home_team, starts_at)
values
  ('lvbp_20261012_1900_tib_mag', 'Tiburones de La Guaira', 'Navegantes del Magallanes', timestamptz '2026-10-12 19:00:00-04'),
  ('lvbp_20261013_1900_mag_tib', 'Navegantes del Magallanes', 'Tiburones de La Guaira', timestamptz '2026-10-13 19:00:00-04'),
  ('lvbp_20261013_1900_tig_car', 'Tigres de Aragua', 'Caribes de Anzoátegui', timestamptz '2026-10-13 19:00:00-04'),
  ('lvbp_20261013_1900_leo_agu', 'Leones del Caracas', 'Águilas del Zulia', timestamptz '2026-10-13 19:00:00-04'),
  ('lvbp_20261014_1900_bra_crd', 'Bravos de Margarita', 'Cardenales de Lara', timestamptz '2026-10-14 19:00:00-04'),
  ('lvbp_20261014_1900_tig_car', 'Tigres de Aragua', 'Caribes de Anzoátegui', timestamptz '2026-10-14 19:00:00-04'),
  ('lvbp_20261014_1900_leo_agu', 'Leones del Caracas', 'Águilas del Zulia', timestamptz '2026-10-14 19:00:00-04'),
  ('lvbp_20261015_1900_tib_car', 'Tiburones de La Guaira', 'Caribes de Anzoátegui', timestamptz '2026-10-15 19:00:00-04'),
  ('lvbp_20261015_1900_crd_agu', 'Cardenales de Lara', 'Águilas del Zulia', timestamptz '2026-10-15 19:00:00-04'),
  ('lvbp_20261015_1900_bra_leo', 'Bravos de Margarita', 'Leones del Caracas', timestamptz '2026-10-15 19:00:00-04'),
  ('lvbp_20261015_1900_mag_tig', 'Navegantes del Magallanes', 'Tigres de Aragua', timestamptz '2026-10-15 19:00:00-04'),
  ('lvbp_20261016_1900_tib_car', 'Tiburones de La Guaira', 'Caribes de Anzoátegui', timestamptz '2026-10-16 19:00:00-04'),
  ('lvbp_20261016_1900_crd_agu', 'Cardenales de Lara', 'Águilas del Zulia', timestamptz '2026-10-16 19:00:00-04'),
  ('lvbp_20261016_1900_bra_leo', 'Bravos de Margarita', 'Leones del Caracas', timestamptz '2026-10-16 19:00:00-04'),
  ('lvbp_20261016_1900_mag_tig', 'Navegantes del Magallanes', 'Tigres de Aragua', timestamptz '2026-10-16 19:00:00-04'),
  ('lvbp_20261017_1800_leo_car', 'Leones del Caracas', 'Caribes de Anzoátegui', timestamptz '2026-10-17 18:00:00-04'),
  ('lvbp_20261017_1800_bra_agu', 'Bravos de Margarita', 'Águilas del Zulia', timestamptz '2026-10-17 18:00:00-04'),
  ('lvbp_20261017_1800_tig_tib', 'Tigres de Aragua', 'Tiburones de La Guaira', timestamptz '2026-10-17 18:00:00-04'),
  ('lvbp_20261017_1800_mag_crd', 'Navegantes del Magallanes', 'Cardenales de Lara', timestamptz '2026-10-17 18:00:00-04'),
  ('lvbp_20261018_1600_leo_car', 'Leones del Caracas', 'Caribes de Anzoátegui', timestamptz '2026-10-18 16:00:00-04'),
  ('lvbp_20261018_1600_tib_tig', 'Tiburones de La Guaira', 'Tigres de Aragua', timestamptz '2026-10-18 16:00:00-04'),
  ('lvbp_20261018_1700_bra_agu', 'Bravos de Margarita', 'Águilas del Zulia', timestamptz '2026-10-18 17:00:00-04'),
  ('lvbp_20261018_1900_crd_mag', 'Cardenales de Lara', 'Navegantes del Magallanes', timestamptz '2026-10-18 19:00:00-04'),
  ('lvbp_20261019_1900_mag_crd', 'Navegantes del Magallanes', 'Cardenales de Lara', timestamptz '2026-10-19 19:00:00-04'),
  ('lvbp_20261020_1900_leo_tib', 'Leones del Caracas', 'Tiburones de La Guaira', timestamptz '2026-10-20 19:00:00-04'),
  ('lvbp_20261020_1900_car_bra', 'Caribes de Anzoátegui', 'Bravos de Margarita', timestamptz '2026-10-20 19:00:00-04'),
  ('lvbp_20261020_1900_tig_agu', 'Tigres de Aragua', 'Águilas del Zulia', timestamptz '2026-10-20 19:00:00-04'),
  ('lvbp_20261021_1900_tib_mag', 'Tiburones de La Guaira', 'Navegantes del Magallanes', timestamptz '2026-10-21 19:00:00-04'),
  ('lvbp_20261021_1900_car_bra', 'Caribes de Anzoátegui', 'Bravos de Margarita', timestamptz '2026-10-21 19:00:00-04'),
  ('lvbp_20261021_1900_tig_agu', 'Tigres de Aragua', 'Águilas del Zulia', timestamptz '2026-10-21 19:00:00-04'),
  ('lvbp_20261022_1900_car_mag', 'Caribes de Anzoátegui', 'Navegantes del Magallanes', timestamptz '2026-10-22 19:00:00-04'),
  ('lvbp_20261022_1900_agu_crd', 'Águilas del Zulia', 'Cardenales de Lara', timestamptz '2026-10-22 19:00:00-04'),
  ('lvbp_20261022_1900_tib_bra', 'Tiburones de La Guaira', 'Bravos de Margarita', timestamptz '2026-10-22 19:00:00-04'),
  ('lvbp_20261023_1900_car_mag', 'Caribes de Anzoátegui', 'Navegantes del Magallanes', timestamptz '2026-10-23 19:00:00-04'),
  ('lvbp_20261023_1900_leo_tig', 'Leones del Caracas', 'Tigres de Aragua', timestamptz '2026-10-23 19:00:00-04'),
  ('lvbp_20261023_1900_agu_crd', 'Águilas del Zulia', 'Cardenales de Lara', timestamptz '2026-10-23 19:00:00-04'),
  ('lvbp_20261023_1900_tib_bra', 'Tiburones de La Guaira', 'Bravos de Margarita', timestamptz '2026-10-23 19:00:00-04'),
  ('lvbp_20261024_1600_car_tib', 'Caribes de Anzoátegui', 'Tiburones de La Guaira', timestamptz '2026-10-24 16:00:00-04'),
  ('lvbp_20261024_1800_crd_tig', 'Cardenales de Lara', 'Tigres de Aragua', timestamptz '2026-10-24 18:00:00-04'),
  ('lvbp_20261024_1800_agu_bra', 'Águilas del Zulia', 'Bravos de Margarita', timestamptz '2026-10-24 18:00:00-04'),
  ('lvbp_20261024_2000_mag_leo', 'Navegantes del Magallanes', 'Leones del Caracas', timestamptz '2026-10-24 20:00:00-04'),
  ('lvbp_20261025_1300_car_tib', 'Caribes de Anzoátegui', 'Tiburones de La Guaira', timestamptz '2026-10-25 13:00:00-04'),
  ('lvbp_20261025_1600_tig_crd', 'Tigres de Aragua', 'Cardenales de Lara', timestamptz '2026-10-25 16:00:00-04'),
  ('lvbp_20261025_1700_agu_bra', 'Águilas del Zulia', 'Bravos de Margarita', timestamptz '2026-10-25 17:00:00-04'),
  ('lvbp_20261025_1900_leo_mag', 'Leones del Caracas', 'Navegantes del Magallanes', timestamptz '2026-10-25 19:00:00-04'),
  ('lvbp_20261026_1900_tig_leo', 'Tigres de Aragua', 'Leones del Caracas', timestamptz '2026-10-26 19:00:00-04'),
  ('lvbp_20261027_1900_crd_bra', 'Cardenales de Lara', 'Bravos de Margarita', timestamptz '2026-10-27 19:00:00-04'),
  ('lvbp_20261027_1900_tib_mag', 'Tiburones de La Guaira', 'Navegantes del Magallanes', timestamptz '2026-10-27 19:00:00-04'),
  ('lvbp_20261027_1900_agu_car', 'Águilas del Zulia', 'Caribes de Anzoátegui', timestamptz '2026-10-27 19:00:00-04'),
  ('lvbp_20261028_1900_crd_bra', 'Cardenales de Lara', 'Bravos de Margarita', timestamptz '2026-10-28 19:00:00-04'),
  ('lvbp_20261028_1900_agu_car', 'Águilas del Zulia', 'Caribes de Anzoátegui', timestamptz '2026-10-28 19:00:00-04'),
  ('lvbp_20261028_1900_tib_leo', 'Tiburones de La Guaira', 'Leones del Caracas', timestamptz '2026-10-28 19:00:00-04'),
  ('lvbp_20261028_1900_mag_tig', 'Navegantes del Magallanes', 'Tigres de Aragua', timestamptz '2026-10-28 19:00:00-04'),
  ('lvbp_20261029_1900_leo_bra', 'Leones del Caracas', 'Bravos de Margarita', timestamptz '2026-10-29 19:00:00-04'),
  ('lvbp_20261029_1900_mag_car', 'Navegantes del Magallanes', 'Caribes de Anzoátegui', timestamptz '2026-10-29 19:00:00-04'),
  ('lvbp_20261029_1900_crd_tib', 'Cardenales de Lara', 'Tiburones de La Guaira', timestamptz '2026-10-29 19:00:00-04'),
  ('lvbp_20261029_1900_agu_tig', 'Águilas del Zulia', 'Tigres de Aragua', timestamptz '2026-10-29 19:00:00-04'),
  ('lvbp_20261030_1900_leo_bra', 'Leones del Caracas', 'Bravos de Margarita', timestamptz '2026-10-30 19:00:00-04'),
  ('lvbp_20261030_1900_mag_car', 'Navegantes del Magallanes', 'Caribes de Anzoátegui', timestamptz '2026-10-30 19:00:00-04'),
  ('lvbp_20261030_1900_agu_tib', 'Águilas del Zulia', 'Tiburones de La Guaira', timestamptz '2026-10-30 19:00:00-04'),
  ('lvbp_20261031_1700_car_leo', 'Caribes de Anzoátegui', 'Leones del Caracas', timestamptz '2026-10-31 17:00:00-04'),
  ('lvbp_20261031_1730_agu_mag', 'Águilas del Zulia', 'Navegantes del Magallanes', timestamptz '2026-10-31 17:30:00-04'),
  ('lvbp_20261031_1800_tib_crd', 'Tiburones de La Guaira', 'Cardenales de Lara', timestamptz '2026-10-31 18:00:00-04'),
  ('lvbp_20261031_2000_tig_bra', 'Tigres de Aragua', 'Bravos de Margarita', timestamptz '2026-10-31 20:00:00-04')
on conflict (id) do nothing;
