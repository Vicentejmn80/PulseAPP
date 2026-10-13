-- Causa del ranking: con p_league_id nulo, pulse_ranking exigía
-- `not exists` en pulse_league_members. Los puntos siguen una sola vez
-- en pulse_transactions (pulse_cycle_points). No hay filas que reescribir:
-- el global pasa a incluir a todos y la liga filtra esos mismos puntos.
-- RETOS_CUENTAN_PARA_PREMIO_RONDA = false dentro de pulse_prize_points.

create or replace function public.pulse_prize_points(p_user_id text, p_cycle text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cycle_start date;
  cycle_end date;
  total integer;
begin
  if p_cycle is null or p_cycle = 'lifetime' then
    cycle_start := null;
    cycle_end := null;
  else
    select starts_on, ends_on into cycle_start, cycle_end
    from public.pulse_cycles where id = p_cycle;
    if cycle_start is null then return 0; end if;
  end if;

  select coalesce(sum(tx.points), 0)::integer into total
  from public.pulse_transactions tx
  left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
  where tx.user_id = p_user_id
    and not coalesce((tx.metadata->>'simulation')::boolean, false)
    and (
      false -- RETOS_CUENTAN_PARA_PREMIO_RONDA
      or tx.source_type not like 'reto_%'
    )
    and (
      tx.metadata->>'matchId' is null
      or (match.id is not null and not match.is_simulation and not match.is_demo)
    )
    and (
      cycle_start is null
      or coalesce(
        (match.starts_at at time zone 'America/Caracas')::date,
        nullif(tx.metadata->>'earnedOn', '')::date,
        nullif(tx.metadata->>'publishDate', '')::date,
        (tx.created_at at time zone 'America/Caracas')::date
      ) between cycle_start and cycle_end
    );
  return total;
end;
$$;

revoke all on function public.pulse_prize_points(text, text) from public, anon, authenticated;

create or replace function public.pulse_ranking(
  p_token text,
  p_cycle text default 'lifetime',
  p_league_id text default null
)
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
  if p_league_id is not null and (
    uid is null or not exists (
      select 1 from public.pulse_league_members member
      where member.league_id = p_league_id and member.user_id = uid
    )
  ) then
    return '[]'::jsonb;
  end if;
  if p_cycle is null or p_cycle = 'lifetime' then
    c_start := null;
    c_end := null;
  else
    select starts_on, ends_on into c_start, c_end
    from public.pulse_cycles where id = p_cycle;
    if c_start is null then return '[]'::jsonb; end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', ranked.position,
      'points', ranked.points,
      'lifetimePoints', ranked.lifetime_points,
      'isCurrentUser', ranked.id = uid,
      'user', jsonb_build_object(
        'id', ranked.id, 'alias', ranked.alias, 'handle', ranked.handle,
        'initials', ranked.initials, 'avatarColor', ranked.avatar_color
      )
    ) order by ranked.position)
    from (
      select profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color,
        public.pulse_cycle_points(profile.id, p_cycle) as points,
        public.pulse_cycle_points(profile.id, 'lifetime') as lifetime_points,
        coalesce(sum(tx.points) filter (
          where tx.source_type = 'prediction'
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        ), 0)::int as prediction_points,
        count(*) filter (
          where tx.source_type = 'prediction' and (tx.metadata->>'errorTotal')::int = 0
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        )::int as exacts,
        count(*) filter (
          where tx.source_type = 'prediction' and (tx.metadata->>'winnerPoints')::int = 40
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        )::int as winners,
        (
          select max(pred.updated_at)
          from public.pulse_match_predictions pred
          join public.pulse_matches pred_match on pred_match.id = pred.match_id
          where pred.user_id = profile.id
            and not pred_match.is_simulation and not pred_match.is_demo
            and (c_start is null or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        ) as last_prediction_at,
        row_number() over (order by
          public.pulse_cycle_points(profile.id, p_cycle) desc,
          coalesce(sum(tx.points) filter (
            where tx.source_type = 'prediction'
              and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ), 0) desc,
          count(*) filter (
            where tx.source_type = 'prediction' and (tx.metadata->>'errorTotal')::int = 0
              and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ) desc,
          count(*) filter (
            where tx.source_type = 'prediction' and (tx.metadata->>'winnerPoints')::int = 40
              and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ) desc,
          (
            select max(pred.updated_at)
            from public.pulse_match_predictions pred
            join public.pulse_matches pred_match on pred_match.id = pred.match_id
            where pred.user_id = profile.id
              and not pred_match.is_simulation and not pred_match.is_demo
              and (c_start is null or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ) asc nulls last,
          profile.alias asc
        ) as position
      from public.pulse_profiles profile
      left join public.pulse_transactions tx on tx.user_id = profile.id
        and not coalesce((tx.metadata->>'simulation')::boolean, false)
        and (
          tx.metadata->>'matchId' is null
          or exists (
            select 1 from public.pulse_matches eligible_match
            where eligible_match.id = tx.metadata->>'matchId'
              and not eligible_match.is_simulation and not eligible_match.is_demo
          )
        )
      left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
      where case when p_league_id is null then true
        else exists (
          select 1 from public.pulse_league_members member
          where member.user_id = profile.id and member.league_id = p_league_id
        )
      end
      group by profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color
    ) ranked
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.pulse_ranking(text, text, text) to anon, authenticated;

create or replace function public.pulse_admin_close_round(p_admin_key text, p_cycle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle public.pulse_cycles%rowtype;
  close_at timestamptz;
  ranked record;
  slot integer := 0;
  code text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if p_cycle = 'demo_cierre' then
    return jsonb_build_object('ok', false, 'error', 'Ese cierre es solo de demostración. Usa el simulador.');
  end if;
  select * into cycle from public.pulse_cycles where id = p_cycle for update;
  if cycle.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa ronda no existe.');
  end if;
  close_at := ((cycle.ends_on + time '23:59:59') at time zone 'America/Caracas');
  if now() < close_at then
    return jsonb_build_object('ok', false, 'error', 'La ronda todavía no llegó a su hora de cierre.');
  end if;
  if exists (
    select 1 from public.pulse_matches match
    where (match.starts_at at time zone 'America/Caracas')::date between cycle.starts_on and cycle.ends_on
      and match.starts_at <= close_at
      and match.status not in ('finished', 'cancelled')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay partidos de esta ronda pendientes de resultado final.');
  end if;
  if exists (select 1 from public.pulse_prizes where cycle_id = p_cycle) then
    update public.pulse_cycles set status = 'closed' where id = p_cycle;
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  for ranked in
    select profile.id as user_id
    from public.pulse_profiles profile
    where profile.prize_eligible
      and public.pulse_prize_points(profile.id, p_cycle) > 0
      and not exists (
        select 1 from public.pulse_league_members member where member.user_id = profile.id
      )
    order by public.pulse_prize_points(profile.id, p_cycle) desc, profile.alias asc
    limit 3
  loop
    slot := slot + 1;
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.pulse_prizes (id, cycle_id, rank_slot, winner_user_id, redemption_code, expires_at)
    values ('prize_' || p_cycle || '_' || slot, p_cycle, slot, ranked.user_id, code, now() + interval '14 days');
    update public.pulse_profiles set prize_eligible = false where id = ranked.user_id;
  end loop;
  update public.pulse_cycles set status = 'closed' where id = p_cycle;
  return jsonb_build_object('ok', true, 'awarded', slot);
end;
$$;

grant execute on function public.pulse_admin_close_round(text, text) to anon, authenticated;

alter table public.pulse_profiles
  add column if not exists adult_confirmed_at timestamptz;

create table if not exists public.pulse_user_devices (
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  device_id text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create table if not exists public.pulse_reto_blocks (
  blocker_id text not null references public.pulse_profiles (id) on delete cascade,
  blocked_id text not null references public.pulse_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.pulse_reto_searches (
  id bigserial primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists pulse_reto_searches_user_time
  on public.pulse_reto_searches (user_id, created_at desc);

create table if not exists public.pulse_retos (
  id text primary key,
  kind text not null check (kind in ('game', 'trivia')),
  challenger_id text not null references public.pulse_profiles (id) on delete cascade,
  opponent_id text not null references public.pulse_profiles (id) on delete cascade,
  match_id text,
  trivia_level text,
  question_ids jsonb,
  stake integer not null check (stake > 0),
  message text not null default '',
  status text not null check (status in ('pending', 'live', 'rejected', 'expired', 'settled', 'void')),
  result text,
  winner_id text,
  accept_until timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);

create index if not exists pulse_retos_pair_day
  on public.pulse_retos (challenger_id, opponent_id, created_at desc);

create table if not exists public.pulse_reto_audit (
  id bigserial primary key,
  reto_id text,
  user_id text,
  action text not null,
  points integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pulse_user_devices enable row level security;
alter table public.pulse_reto_blocks enable row level security;
alter table public.pulse_reto_searches enable row level security;
alter table public.pulse_retos enable row level security;
alter table public.pulse_reto_audit enable row level security;

create or replace function public.pulse_reto_post(
  p_reto text,
  p_user text,
  p_action text,
  p_points integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := 'reto_' || p_action;
  v_source_id text := p_reto || ':' || p_user || ':' || p_action;
begin
  insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
  values (
    'tx_' || substr(md5(v_source_type || ':' || v_source_id), 1, 24),
    p_user,
    'exp_tobo',
    v_source_type,
    v_source_id,
    p_points,
    jsonb_build_object(
      'retoId', p_reto,
      'earnedOn', (now() at time zone 'America/Caracas')::date,
      'countsForRoundPrize', false
    )
  )
  on conflict (source_type, source_id) do nothing;

  insert into public.pulse_reto_audit (reto_id, user_id, action, points)
  values (p_reto, p_user, p_action, p_points);
end;
$$;

revoke all on function public.pulse_reto_post(text, text, text, integer) from public, anon, authenticated;

create or replace function public.pulse_reto_locked_questions(p_user text, p_level text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select reto.question_ids
  from public.pulse_retos reto
  where reto.kind = 'trivia'
    and reto.status = 'live'
    and reto.trivia_level = p_level
    and (reto.challenger_id = p_user or reto.opponent_id = p_user)
    and reto.question_ids is not null
  order by reto.created_at desc
  limit 1;
$$;

revoke all on function public.pulse_reto_locked_questions(text, text) from public, anon, authenticated;

create or replace function public.pulse_reto_settle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reto public.pulse_retos%rowtype;
  match public.pulse_matches%rowtype;
  played_a boolean;
  played_b boolean;
  points_a integer;
  points_b integer;
  error_a integer;
  error_b integer;
  time_a numeric;
  time_b numeric;
  needed integer;
  answers_a integer;
  answers_b integer;
  winner text;
  outcome text;
begin
  for reto in
    select * from public.pulse_retos
    where status in ('pending', 'live')
    order by created_at
    for update
  loop
    if reto.status = 'pending' and now() >= reto.accept_until then
      perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
      update public.pulse_retos
      set status = 'expired', result = 'void', resolved_at = now()
      where id = reto.id;
      continue;
    end if;

    if reto.status <> 'live' then
      continue;
    end if;

    if reto.kind = 'game' then
      select * into match from public.pulse_matches where id = reto.match_id;
      if match.id is null or match.status in ('cancelled', 'postponed') then
        perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
        perform public.pulse_reto_post(reto.id, reto.opponent_id, 'release', reto.stake);
        update public.pulse_retos set status = 'void', result = 'void', resolved_at = now() where id = reto.id;
        continue;
      end if;
      if match.status <> 'finished' then
        continue;
      end if;

      played_a := exists (
        select 1 from public.pulse_match_predictions pred
        where pred.user_id = reto.challenger_id and pred.match_id = reto.match_id
      );
      played_b := exists (
        select 1 from public.pulse_match_predictions pred
        where pred.user_id = reto.opponent_id and pred.match_id = reto.match_id
      );
      select coalesce(sum(tx.points), 0)::int into points_a
      from public.pulse_transactions tx
      where tx.user_id = reto.challenger_id
        and tx.source_type = 'prediction'
        and tx.metadata->>'matchId' = reto.match_id;
      select coalesce(sum(tx.points), 0)::int into points_b
      from public.pulse_transactions tx
      where tx.user_id = reto.opponent_id
        and tx.source_type = 'prediction'
        and tx.metadata->>'matchId' = reto.match_id;
      select abs(pred.predicted_home_score - match.home_score) + abs(pred.predicted_away_score - match.away_score)
      into error_a
      from public.pulse_match_predictions pred
      where pred.user_id = reto.challenger_id and pred.match_id = reto.match_id;
      select abs(pred.predicted_home_score - match.home_score) + abs(pred.predicted_away_score - match.away_score)
      into error_b
      from public.pulse_match_predictions pred
      where pred.user_id = reto.opponent_id and pred.match_id = reto.match_id;

      if not played_a and not played_b then
        outcome := 'tie';
        winner := null;
      elsif played_a and not played_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif played_b and not played_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif points_a > points_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif points_b > points_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif coalesce(error_a, 999) < coalesce(error_b, 999) then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif coalesce(error_b, 999) < coalesce(error_a, 999) then
        outcome := 'opponent';
        winner := reto.opponent_id;
      else
        outcome := 'tie';
        winner := null;
      end if;
    else
      needed := coalesce(jsonb_array_length(reto.question_ids), 0);
      select count(*)::int, coalesce(sum(answer.points), 0)::int,
        coalesce(extract(epoch from max(answer.answered_at) - min(answer.answered_at)), 0)
      into answers_a, points_a, time_a
      from public.pulse_trivia_answers answer
      where answer.user_id = reto.challenger_id
        and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)));
      select count(*)::int, coalesce(sum(answer.points), 0)::int,
        coalesce(extract(epoch from max(answer.answered_at) - min(answer.answered_at)), 0)
      into answers_b, points_b, time_b
      from public.pulse_trivia_answers answer
      where answer.user_id = reto.opponent_id
        and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)));
      played_a := needed > 0 and answers_a >= needed;
      played_b := needed > 0 and answers_b >= needed;
      if now() < reto.accept_until and not (played_a and played_b) then
        continue;
      end if;

      if not played_a and not played_b then
        outcome := 'tie';
        winner := null;
      elsif played_a and not played_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif played_b and not played_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif points_a > points_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif points_b > points_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif time_a < time_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif time_b < time_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      else
        outcome := 'tie';
        winner := null;
      end if;
    end if;

    if outcome = 'tie' then
      perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
      perform public.pulse_reto_post(reto.id, reto.opponent_id, 'release', reto.stake);
      update public.pulse_retos
      set status = 'settled', result = 'tie', winner_id = null, resolved_at = now()
      where id = reto.id;
    else
      perform public.pulse_reto_post(reto.id, winner, 'release', reto.stake);
      perform public.pulse_reto_post(reto.id, winner, 'win', reto.stake);
      update public.pulse_retos
      set status = 'settled', result = outcome, winner_id = winner, resolved_at = now()
      where id = reto.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.pulse_reto_settle() from public, anon, authenticated;

create or replace function public.pulse_reto_search(p_token text, p_prefix text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  prefix text := lower(trim(coalesce(p_prefix, '')));
  recent integer;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  if char_length(prefix) < 3 then
    return jsonb_build_object('ok', true, 'aliases', '[]'::jsonb);
  end if;

  select count(*) into recent
  from public.pulse_reto_searches search
  where search.user_id = uid and search.created_at > now() - interval '1 minute';
  if recent >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Espera un momento antes de buscar otro alias.');
  end if;
  insert into public.pulse_reto_searches (user_id) values (uid);

  return jsonb_build_object(
    'ok', true,
    'aliases', coalesce((
      select jsonb_agg(jsonb_build_object('alias', found.alias))
      from (
        select profile.alias
        from public.pulse_profiles profile
        where lower(profile.alias) like prefix || '%'
          and profile.id <> uid
          and not exists (
            select 1 from public.pulse_reto_blocks block
            where (block.blocker_id = profile.id and block.blocked_id = uid)
               or (block.blocker_id = uid and block.blocked_id = profile.id)
          )
        order by profile.alias
        limit 5
      ) found
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_reto_create(
  p_token text,
  p_kind text,
  p_alias text,
  p_stake integer,
  p_message text,
  p_match_id text,
  p_trivia_level text,
  p_device text,
  p_adult boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  opp text;
  opp_alias text;
  available integer;
  cap integer;
  active_count integer;
  pair_count integer;
  day_stake integer;
  today date := (now() at time zone 'America/Caracas')::date;
  reto_id text;
  note text;
  diff text;
  picked jsonb;
  deadline timestamptz;
  game public.pulse_matches%rowtype;
begin
  perform public.pulse_reto_settle();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  if coalesce(p_adult, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'Los retos son solo para mayores de 18.');
  end if;
  if coalesce(trim(p_device), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'No se pudo identificar el dispositivo.');
  end if;

  select id, alias into opp, opp_alias
  from public.pulse_profiles
  where lower(alias) = lower(trim(coalesce(p_alias, '')))
  limit 1;
  if opp is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos ese alias.');
  end if;
  if opp = uid then
    return jsonb_build_object('ok', false, 'error', 'No puedes retarte a ti mismo.');
  end if;
  if exists (
    select 1 from public.pulse_reto_blocks block
    where (block.blocker_id = opp and block.blocked_id = uid)
       or (block.blocker_id = uid and block.blocked_id = opp)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese rival no acepta retos.');
  end if;

  if uid < opp then
    perform pg_advisory_xact_lock(hashtext('reto-user:' || uid));
    perform pg_advisory_xact_lock(hashtext('reto-user:' || opp));
  else
    perform pg_advisory_xact_lock(hashtext('reto-user:' || opp));
    perform pg_advisory_xact_lock(hashtext('reto-user:' || uid));
  end if;

  insert into public.pulse_user_devices (user_id, device_id)
  values (uid, trim(p_device))
  on conflict (user_id, device_id) do update set seen_at = now();
  if exists (
    select 1 from public.pulse_user_devices device
    where device.device_id = trim(p_device) and device.user_id = opp
  ) then
    return jsonb_build_object('ok', false, 'error', 'No puedes retar una cuenta de este mismo dispositivo.');
  end if;

  update public.pulse_profiles set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = uid;

  available := public.pulse_cycle_points(uid, 'lifetime');
  cap := least(20, floor(available * 25 / 100.0)::int, available);
  if p_stake is null or p_stake < 2 or p_stake > 20 or p_stake > cap or p_stake > available then
    return jsonb_build_object('ok', false, 'error', 'No puedes apostar más puntos de los que tienes.');
  end if;

  select count(*) into active_count
  from public.pulse_retos reto
  where reto.status in ('pending', 'live')
    and (reto.challenger_id = uid or reto.opponent_id = uid);
  if active_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes 5 retos activos.');
  end if;
  select count(*) into active_count
  from public.pulse_retos reto
  where reto.status in ('pending', 'live')
    and (reto.challenger_id = opp or reto.opponent_id = opp);
  if active_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Ese rival ya tiene 5 retos activos.');
  end if;

  select count(*) into pair_count
  from public.pulse_retos reto
  where (reto.created_at at time zone 'America/Caracas')::date = today
    and reto.status in ('pending', 'live', 'settled')
    and (
      (reto.challenger_id = uid and reto.opponent_id = opp)
      or (reto.challenger_id = opp and reto.opponent_id = uid)
    );
  if pair_count >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Hoy ya se retaron 3 veces.');
  end if;

  select coalesce(sum(reto.stake), 0) into day_stake
  from public.pulse_retos reto
  where reto.challenger_id = uid
    and (reto.created_at at time zone 'America/Caracas')::date = today
    and reto.status in ('pending', 'live', 'settled');
  if day_stake + p_stake > 100 then
    return jsonb_build_object('ok', false, 'error', 'Llegaste al límite diario de puntos apostados.');
  end if;

  note := left(trim(coalesce(p_message, '')), 60);

  if p_kind = 'game' then
    select * into game from public.pulse_matches where id = p_match_id;
    if game.id is null or game.is_simulation or game.is_demo or game.status <> 'scheduled' or game.starts_at <= now() then
      return jsonb_build_object('ok', false, 'error', 'Ese juego ya no admite retos.');
    end if;
    if not exists (
      select 1 from public.pulse_match_predictions pred
      where pred.user_id = uid and pred.match_id = game.id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Primero guarda tu pronóstico.');
    end if;
    deadline := game.starts_at;
  elsif p_kind = 'trivia' then
    diff := public.pulse_trivia_difficulty(p_trivia_level);
    if diff is null then
      return jsonb_build_object('ok', false, 'error', 'Esa trivia no existe.');
    end if;
    select session.question_ids into picked
    from public.pulse_trivia_sessions session
    where session.user_id = uid and session.difficulty = diff and session.completed_at is null
    order by session.started_at desc
    limit 1;
    if picked is null or jsonb_array_length(picked) = 0 then
      select coalesce(jsonb_agg(chosen.id), '[]'::jsonb) into picked
      from (
        select question.id
        from public.pulse_trivia_questions question
        where question.status = 'active' and question.difficulty = diff
        order by md5(question.id || ':' || uid || ':' || today::text)
        limit 4
      ) chosen;
    end if;
    if jsonb_array_length(picked) = 0 then
      return jsonb_build_object('ok', false, 'error', 'Hoy no hay trivia para ese nivel.');
    end if;
    deadline := ((today + 1)::timestamp at time zone 'America/Caracas');
  else
    return jsonb_build_object('ok', false, 'error', 'Ese tipo de reto no existe.');
  end if;

  reto_id := 'reto_' || substr(md5(uid || ':' || opp || ':' || clock_timestamp()::text || ':' || gen_random_uuid()::text), 1, 20);
  insert into public.pulse_retos (
    id, kind, challenger_id, opponent_id, match_id, trivia_level, question_ids,
    stake, message, status, accept_until
  ) values (
    reto_id, p_kind, uid, opp,
    case when p_kind = 'game' then game.id else null end,
    case when p_kind = 'trivia' then p_trivia_level else null end,
    case when p_kind = 'trivia' then picked else null end,
    p_stake, note, 'pending', deadline
  );
  perform public.pulse_reto_post(reto_id, uid, 'hold', -p_stake);
  return jsonb_build_object('ok', true, 'id', reto_id, 'alias', opp_alias, 'stake', p_stake);
end;
$$;

create or replace function public.pulse_reto_respond(
  p_token text,
  p_reto_id text,
  p_accept boolean,
  p_device text,
  p_adult boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  reto public.pulse_retos%rowtype;
  available integer;
  cap integer;
begin
  perform public.pulse_reto_settle();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  select * into reto from public.pulse_retos where id = p_reto_id for update;
  if reto.id is null or reto.opponent_id <> uid or reto.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Ese reto ya no está pendiente.');
  end if;
  if now() >= reto.accept_until then
    perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
    update public.pulse_retos set status = 'expired', result = 'void', resolved_at = now() where id = reto.id;
    return jsonb_build_object('ok', false, 'error', 'El reto venció y se devolvieron los puntos.');
  end if;

  if coalesce(p_accept, false) is not true then
    perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
    update public.pulse_retos set status = 'rejected', result = 'void', resolved_at = now() where id = reto.id;
    return jsonb_build_object('ok', true);
  end if;

  if coalesce(p_adult, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'Los retos son solo para mayores de 18.');
  end if;
  if coalesce(trim(p_device), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'No se pudo identificar el dispositivo.');
  end if;
  insert into public.pulse_user_devices (user_id, device_id)
  values (uid, trim(p_device))
  on conflict (user_id, device_id) do update set seen_at = now();
  if exists (
    select 1 from public.pulse_user_devices device
    where device.device_id = trim(p_device) and device.user_id = reto.challenger_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'No puedes aceptar un reto de una cuenta de este mismo dispositivo.');
  end if;

  perform pg_advisory_xact_lock(hashtext('reto-user:' || uid));
  available := public.pulse_cycle_points(uid, 'lifetime');
  cap := least(20, floor(available * 25 / 100.0)::int, available);
  if reto.stake > available or reto.stake > cap then
    return jsonb_build_object('ok', false, 'error', 'No tienes puntos suficientes para aceptar.');
  end if;

  perform public.pulse_reto_post(reto.id, uid, 'hold', -reto.stake);
  update public.pulse_profiles set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = uid;
  update public.pulse_retos set status = 'live' where id = reto.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_reto_block(p_token text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  opp text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  select id into opp from public.pulse_profiles where lower(alias) = lower(trim(coalesce(p_alias, ''))) limit 1;
  if opp is null or opp = uid then
    return jsonb_build_object('ok', false, 'error', 'No encontramos ese alias.');
  end if;
  insert into public.pulse_reto_blocks (blocker_id, blocked_id)
  values (uid, opp)
  on conflict do nothing;
  insert into public.pulse_reto_audit (reto_id, user_id, action, points)
  values (null, uid, 'block', 0);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_reto_board(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  available integer;
  cap integer;
begin
  perform public.pulse_reto_settle();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.', 'items', '[]'::jsonb, 'won', 0, 'lost', 0, 'pending', 0, 'points', 0, 'maxStake', 0);
  end if;
  available := public.pulse_cycle_points(uid, 'lifetime');
  cap := least(20, greatest(floor(available * 25 / 100.0)::int, 0), greatest(available, 0));

  return jsonb_build_object(
    'ok', true,
    'points', available,
    'maxStake', cap,
    'won', (
      select count(*) from public.pulse_retos reto
      where reto.status = 'settled' and reto.winner_id = uid
    ),
    'lost', (
      select count(*) from public.pulse_retos reto
      where reto.status = 'settled' and reto.winner_id is not null and reto.winner_id <> uid
        and (reto.challenger_id = uid or reto.opponent_id = uid)
    ),
    'pending', (
      select count(*) from public.pulse_retos reto
      where reto.status = 'pending' and reto.opponent_id = uid
    ),
    'items', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select
          reto.id,
          reto.kind,
          coalesce(reto.match_id, '') as "matchId",
          coalesce(reto.trivia_level, '') as "triviaLevel",
          reto.status,
          reto.stake,
          reto.message,
          rival.alias as rival,
          (reto.opponent_id = uid) as incoming,
          case
            when reto.kind = 'game' then coalesce(game.away_team, 'Juego') || ' vs ' || coalesce(game.home_team, '')
            else 'Trivia ' || coalesce(reto.trivia_level, '')
          end as label,
          reto.accept_until as "acceptUntil",
          (
            select count(*) from public.pulse_retos past
            where past.status = 'settled' and past.winner_id = uid
              and ((past.challenger_id = uid and past.opponent_id = rival.id) or (past.opponent_id = uid and past.challenger_id = rival.id))
          ) as "h2hMine",
          (
            select count(*) from public.pulse_retos past
            where past.status = 'settled' and past.winner_id = rival.id
              and ((past.challenger_id = uid and past.opponent_id = rival.id) or (past.opponent_id = uid and past.challenger_id = rival.id))
          ) as "h2hTheirs",
          case when reto.kind = 'game' then (
            select coalesce(sum(tx.points), 0)::int from public.pulse_transactions tx
            where tx.user_id = uid and tx.source_type = 'prediction' and tx.metadata->>'matchId' = reto.match_id
          ) else (
            select coalesce(sum(answer.points), 0)::int from public.pulse_trivia_answers answer
            where answer.user_id = uid and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)))
          ) end as "mineScore",
          case when reto.status = 'settled' and reto.kind = 'game' then (
            select coalesce(sum(tx.points), 0)::int from public.pulse_transactions tx
            where tx.user_id = rival.id and tx.source_type = 'prediction' and tx.metadata->>'matchId' = reto.match_id
          ) when reto.status = 'settled' then (
            select coalesce(sum(answer.points), 0)::int from public.pulse_trivia_answers answer
            where answer.user_id = rival.id and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)))
          ) else null end as "rivalScore",
          case
            when reto.status = 'settled' and reto.result = 'tie' then 'tie'
            when reto.status = 'void' then 'void'
            when reto.status = 'expired' then 'expired'
            when reto.status = 'rejected' then 'rejected'
            when reto.status = 'settled' and reto.winner_id = uid then 'won'
            when reto.status = 'settled' then 'lost'
            when reto.status = 'live' then 'live'
            else 'pending'
          end as outcome
        from public.pulse_retos reto
        join public.pulse_profiles rival
          on rival.id = case when reto.challenger_id = uid then reto.opponent_id else reto.challenger_id end
        left join public.pulse_matches game on game.id = reto.match_id
        where reto.challenger_id = uid or reto.opponent_id = uid
        order by reto.created_at desc
        limit 12
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.pulse_reto_search(text, text) to anon, authenticated;
grant execute on function public.pulse_reto_create(text, text, text, integer, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.pulse_reto_respond(text, text, boolean, text, boolean) to anon, authenticated;
grant execute on function public.pulse_reto_block(text, text) to anon, authenticated;
grant execute on function public.pulse_reto_board(text) to anon, authenticated;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.pulse_trivia_start(text,text)'::regprocedure);
  if position('pulse_reto_locked_questions' in src) > 0 then
    return;
  end if;
  if position('picked jsonb;' in src) = 0 or position('if open_row.id is null then' in src) = 0 then
    raise exception 'No se pudo enganchar la trivia compartida del reto';
  end if;
  src := replace(src, 'picked jsonb;', E'picked jsonb;\n  locked_questions jsonb;');
  src := replace(src, 'if open_row.id is null then', $hook$
locked_questions := public.pulse_reto_locked_questions(uid, p_level);
if locked_questions is not null and open_row.id is not null and not exists (
  select 1 from public.pulse_trivia_answers answer where answer.session_id = open_row.id
) then
  update public.pulse_trivia_sessions
  set question_ids = locked_questions
  where id = open_row.id;
  open_row.question_ids := locked_questions;
end if;
if open_row.id is null then$hook$);
  src := replace(src, 'if diff = ''easy'' then', 'if locked_questions is not null then picked := locked_questions; elsif diff = ''easy'' then');
  execute src;
end
$patch$;
