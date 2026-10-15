-- Consola v2. No cambia la fórmula de puntos: publicar sigue en pulse_admin_set_result.
-- Califica active/name para que un UPDATE o un filtro no choque con una variable.
-- Quita el overload de usuarios de 4 argumentos, que nombraba una variable phone igual que la columna.

alter table public.pulse_admins
  add column if not exists role text not null default 'super';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pulse_admins_role_check') then
    alter table public.pulse_admins
      add constraint pulse_admins_role_check check (role in ('super', 'operator'));
  end if;
end $$;

create index if not exists pulse_profiles_created_at_idx on public.pulse_profiles (created_at desc);
create index if not exists pulse_sessions_created_at_idx on public.pulse_sessions (created_at desc);
create index if not exists pulse_sessions_user_created_idx on public.pulse_sessions (user_id, created_at desc);
create index if not exists pulse_match_predictions_match_idx on public.pulse_match_predictions (match_id);
create index if not exists pulse_transactions_created_at_idx on public.pulse_transactions (created_at desc);

create or replace function public.pulse_admin_require_super(p_admin_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  seat_role text;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  select a.role into seat_role from public.pulse_admins a where a.user_id = actor;
  if coalesce(seat_role, 'super') <> 'super' then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.pulse_admin_whoami(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  seat_role text;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  select a.role into seat_role from public.pulse_admins a where a.user_id = actor;
  return jsonb_build_object('ok', true, 'userId', actor, 'role', coalesce(seat_role, 'super'));
end;
$$;

create or replace function public.pulse_admin_overview(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  day_start timestamptz := (public.pulse_caracas_today()::timestamp at time zone 'America/Caracas');
begin
  -- No declarar una variable "actor": la actividad también tiene una columna actor.
  perform public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'users', (select count(*) from public.pulse_profiles),
    'usersToday', (select count(*) from public.pulse_profiles where created_at >= day_start),
    'users7d', (select count(*) from public.pulse_profiles where created_at >= now() - interval '7 days'),
    'users30d', (select count(*) from public.pulse_profiles where created_at >= now() - interval '30 days'),
    'sessionsToday', (select count(distinct user_id) from public.pulse_sessions where created_at >= day_start),
    'sessions24h', (select count(distinct user_id) from public.pulse_sessions where created_at >= now() - interval '24 hours'),
    'sessions7d', (select count(distinct user_id) from public.pulse_sessions where created_at >= now() - interval '7 days'),
    'players', (select count(distinct user_id) from public.pulse_match_predictions),
    'predictionsToday', (select count(*) from public.pulse_match_predictions where created_at >= day_start),
    'matchesAwaiting', (
      select count(*) from public.pulse_matches
      where coalesce(is_simulation, false) = false
        and coalesce(is_demo, false) = false
        and status in ('scheduled', 'locked', 'in_progress', 'postponed')
        and starts_at < now()
    ),
    'matchesUpcoming', (
      select count(*) from public.pulse_matches
      where status in ('scheduled', 'locked')
        and coalesce(is_simulation, false) = false
        and coalesce(is_demo, false) = false
    ),
    'matchesLive', (
      select count(*) from public.pulse_matches
      where status = 'in_progress'
        and coalesce(is_simulation, false) = false
        and coalesce(is_demo, false) = false
    ),
    'matchesFinished', (
      select count(*) from public.pulse_matches
      where status = 'finished'
        and coalesce(is_simulation, false) = false
        and coalesce(is_demo, false) = false
    ),
    'predictions', (select count(*) from public.pulse_match_predictions),
    'predictionsPending', (
      select count(*)
      from public.pulse_match_predictions p
      join public.pulse_matches m on m.id = p.match_id
      where m.status = 'finished' and p.processed_at is null
    ),
    'pointsDistributed', (select coalesce(sum(points), 0) from public.pulse_transactions where points > 0),
    'venuesActive', (select count(*) from public.pulse_venues where pulse_venues.active),
    'campaignsActive', (select count(*) from public.pulse_campaigns where pulse_campaigns.active),
    'campaignAccounts', (select count(*) from public.pulse_campaign_rewards where new_account),
    'qrRewards', (select count(*) from public.pulse_transactions where source_type = 'qr_scan'),
    'campaignRewards', (select count(*) from public.pulse_campaign_rewards),
    'generatedAt', now(),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(series.day, 'DD/MM'), 'count', (
        select count(*) from public.pulse_profiles p
        where (p.created_at at time zone 'America/Caracas')::date = series.day::date
      )) order by series.day)
      from generate_series(public.pulse_caracas_today() - 13, public.pulse_caracas_today(), interval '1 day') as series(day)
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(row_to_json(item) order by item.at desc)
      from (
        select at, kind, actor, entity, ok, detail
        from (
          select p.created_at as at, 'register'::text as kind, p.handle as actor, p.handle as entity, true as ok, ''::text as detail
          from public.pulse_profiles p
          order by p.created_at desc
          limit 10
        ) registrations
        union all
        select at, kind, actor, entity, ok, detail
        from (
          select s.created_at as at, 'login'::text as kind, pr.handle as actor, pr.handle as entity, true as ok, ''::text as detail
          from public.pulse_sessions s
          join public.pulse_profiles pr on pr.id = s.user_id
          order by s.created_at desc
          limit 10
        ) sessions
        union all
        select at, kind, actor, entity, ok, detail
        from (
          select a.created_at as at, a.action as kind, pr.handle as actor, coalesce(a.target, '') as entity, a.ok, coalesce(a.details->>'phase', '') as detail
          from public.pulse_admin_audit a
          join public.pulse_profiles pr on pr.id = a.user_id
          order by a.created_at desc
          limit 10
        ) audits
        union all
        select at, kind, actor, entity, ok, detail
        from (
          select r.created_at as at, 'campaign_reward'::text as kind, pr.handle as actor, c.name as entity, true as ok, r.points::text as detail
          from public.pulse_campaign_rewards r
          join public.pulse_profiles pr on pr.id = r.user_id
          join public.pulse_campaigns c on c.id = r.campaign_id
          order by r.created_at desc
          limit 10
        ) rewards
        order by at desc
        limit 10
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.pulse_admin_users(text, text, integer, integer);

create or replace function public.pulse_admin_users(
  p_admin_key text,
  p_query text,
  p_limit integer,
  p_offset integer,
  p_status text default '',
  p_sort text default 'newest'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  needle text := trim(coalesce(p_query, ''));
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  off integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
  normalized_phone text := public.pulse_normalize_phone(needle);
  stat text := trim(coalesce(p_status, ''));
  sort text := trim(coalesce(p_sort, 'newest'));
  total integer;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  select count(*) into total
  from public.pulse_profiles p
  where (
      needle = ''
      or p.handle ilike '%' || needle || '%'
      or p.alias ilike '%' || needle || '%'
      or p.id = needle
      or (normalized_phone <> '' and p.phone = normalized_phone)
    )
    and (
      stat = ''
      or (stat = 'suspended' and p.suspended_at is not null)
      or (stat = 'new' and p.created_at >= now() - interval '24 hours')
      or (stat = 'active24' and exists (
        select 1 from public.pulse_sessions s
        where s.user_id = p.id and s.created_at >= now() - interval '24 hours'
      ))
      or (stat = 'inactive7' and p.created_at < now() - interval '7 days' and not exists (
        select 1 from public.pulse_sessions s
        where s.user_id = p.id and s.created_at >= now() - interval '7 days'
      ))
    );
  return jsonb_build_object(
    'ok', true,
    'total', total,
    'users', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select
          p.id,
          p.handle,
          p.alias,
          p.avatar_id as "avatarId",
          p.full_name as "fullName",
          p.phone,
          p.city,
          p.created_at as "createdAt",
          p.prize_eligible as "prizeEligible",
          p.suspended_at as "suspendedAt",
          (select max(s.created_at) from public.pulse_sessions s where s.user_id = p.id) as "lastSessionAt",
          coalesce((select sum(t.points) from public.pulse_transactions t where t.user_id = p.id), 0) as points
        from public.pulse_profiles p
        where (
            needle = ''
            or p.handle ilike '%' || needle || '%'
            or p.alias ilike '%' || needle || '%'
            or p.id = needle
            or (normalized_phone <> '' and p.phone = normalized_phone)
          )
          and (
            stat = ''
            or (stat = 'suspended' and p.suspended_at is not null)
            or (stat = 'new' and p.created_at >= now() - interval '24 hours')
            or (stat = 'active24' and exists (
              select 1 from public.pulse_sessions s
              where s.user_id = p.id and s.created_at >= now() - interval '24 hours'
            ))
            or (stat = 'inactive7' and p.created_at < now() - interval '7 days' and not exists (
              select 1 from public.pulse_sessions s
              where s.user_id = p.id and s.created_at >= now() - interval '7 days'
            ))
          )
        order by
          case when sort = 'points' then coalesce((select sum(t.points) from public.pulse_transactions t where t.user_id = p.id), 0) end desc nulls last,
          p.created_at desc
        limit lim offset off
      ) item
    ), '[]'::jsonb)
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
  actor text;
  match public.pulse_matches;
  pred public.pulse_match_predictions;
  breakdown jsonb;
  winners integer := 0;
  awarded integer := 0;
  exact integer := 0;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'El resultado no puede quedar empatado.');
  end if;
  select * into match from public.pulse_matches where id = trim(coalesce(p_match_id, ''));
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  for pred in
    select * from public.pulse_match_predictions where match_id = match.id
  loop
    breakdown := public.pulse_score_breakdown(
      pred.predicted_home_score,
      pred.predicted_away_score,
      p_home_score,
      p_away_score
    );
    if coalesce((breakdown->>'total')::integer, 0) > 0 then
      winners := winners + 1;
      awarded := awarded + (breakdown->>'total')::integer;
    end if;
    if coalesce((breakdown->>'errorTotal')::integer, 0) = 0 then
      exact := exact + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'winners', winners, 'points', awarded, 'exact', exact);
end;
$$;

create or replace function public.pulse_admin_top_predictors(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'players', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select pr.handle, pr.avatar_id as "avatarId", sum(tx.points) as points
        from public.pulse_transactions tx
        join public.pulse_profiles pr on pr.id = tx.user_id
        where tx.source_type = 'prediction' and tx.points > 0
        group by pr.id, pr.handle, pr.avatar_id
        order by sum(tx.points) desc, pr.handle
        limit 5
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_admin_adjust_points(
  p_admin_key text,
  p_user_id text,
  p_points integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  reason text := trim(coalesce(p_reason, ''));
  request_id text := trim(coalesce(p_request_id, ''));
  target public.pulse_profiles;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if reason = '' or char_length(reason) < 8 or char_length(reason) > 200 then
    return jsonb_build_object('ok', false, 'error', 'Escribe un motivo de 8 a 200 caracteres.');
  end if;
  if request_id !~ '^[A-Za-z0-9_-]{8,80}$' then
    return jsonb_build_object('ok', false, 'error', 'La operación no tiene un identificador válido.');
  end if;
  if p_points is null or p_points = 0 or p_points < -1000 or p_points > 1000 then
    return jsonb_build_object('ok', false, 'error', 'La corrección debe estar entre -1000 y 1000, y no puede ser cero.');
  end if;
  select * into target from public.pulse_profiles where id = trim(coalesce(p_user_id, ''));
  if target.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese usuario no existe.');
  end if;
  insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
  values (
    'tx_' || md5('admin_adjust:' || request_id),
    target.id,
    'exp_tobo',
    'admin_adjust',
    request_id,
    p_points,
    jsonb_build_object('reason', reason, 'adminId', actor)
  )
  on conflict (source_type, source_id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_adjust_points', target.id, true, jsonb_build_object('points', p_points, 'reason', reason, 'requestId', request_id));
  return jsonb_build_object('ok', true, 'already', false, 'points', p_points);
end;
$$;

create or replace function public.pulse_admin_set_suspension(
  p_admin_key text,
  p_user_id text,
  p_suspend boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  reason text := trim(coalesce(p_reason, ''));
  target public.pulse_profiles;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if p_suspend and (char_length(reason) < 8 or char_length(reason) > 200) then
    return jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la suspensión.');
  end if;
  select * into target from public.pulse_profiles where id = trim(coalesce(p_user_id, '')) for update;
  if target.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese usuario no existe.');
  end if;
  if target.id = actor then
    return jsonb_build_object('ok', false, 'error', 'No puedes suspender tu propia cuenta desde aquí.');
  end if;
  update public.pulse_profiles
  set suspended_at = case when p_suspend then now() else null end,
      suspended_reason = case when p_suspend then reason else null end
  where id = target.id;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_set_suspension', target.id, true, jsonb_build_object('suspend', coalesce(p_suspend, false), 'reason', reason));
  return jsonb_build_object('ok', true, 'suspended', coalesce(p_suspend, false));
end;
$$;

create or replace function public.pulse_admin_team(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'admins', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select pr.handle, pr.alias, pr.avatar_id as "avatarId", a.granted_at as "grantedAt", a.granted_by as "grantedBy", a.role
        from public.pulse_admins a
        join public.pulse_profiles pr on pr.id = a.user_id
        order by a.granted_at
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.pulse_admin_grant(text, text, text);

create or replace function public.pulse_admin_grant(
  p_admin_key text,
  p_handle text,
  p_reason text,
  p_role text default 'operator'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  reason text := trim(coalesce(p_reason, ''));
  wanted text := trim(coalesce(p_handle, ''));
  seat_role text := case when trim(coalesce(p_role, '')) = 'super' then 'super' else 'operator' end;
  matches integer;
  target public.pulse_profiles;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if char_length(reason) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Escribe por qué recibe acceso.');
  end if;
  if wanted !~ '^@[A-Za-z0-9._]{2,32}$' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el alias exacto, con @.');
  end if;
  select count(*) into matches from public.pulse_profiles where pulse_profiles.handle = wanted;
  if matches <> 1 then
    return jsonb_build_object('ok', false, 'error', 'No hay una sola cuenta con ese alias exacto.');
  end if;
  select * into target from public.pulse_profiles where pulse_profiles.handle = wanted;
  if target.id = actor and seat_role <> 'super' then
    return jsonb_build_object('ok', false, 'error', 'No puedes quitarte el rol de super admin.');
  end if;
  insert into public.pulse_admins (user_id, granted_by, role)
  values (target.id, actor, seat_role)
  on conflict (user_id) do update set role = excluded.role;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_grant', target.id, true, jsonb_build_object('reason', reason, 'handle', target.handle, 'role', seat_role));
  return jsonb_build_object('ok', true, 'handle', target.handle, 'role', seat_role);
end;
$$;

create or replace function public.pulse_admin_revoke(
  p_admin_key text,
  p_handle text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  reason text := trim(coalesce(p_reason, ''));
  wanted text := trim(coalesce(p_handle, ''));
  target public.pulse_profiles;
  supers integer;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if char_length(reason) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Escribe por qué se quita el acceso.');
  end if;
  select * into target from public.pulse_profiles where handle = wanted;
  if target.id is null then
    return jsonb_build_object('ok', false, 'error', 'No hay una cuenta con ese alias exacto.');
  end if;
  if target.id = actor then
    return jsonb_build_object('ok', false, 'error', 'No puedes quitar tu propio acceso.');
  end if;
  select count(*) into supers from public.pulse_admins where role = 'super';
  if supers <= 1 and exists (select 1 from public.pulse_admins where user_id = target.id and role = 'super') then
    return jsonb_build_object('ok', false, 'error', 'Tiene que quedar al menos un super admin.');
  end if;
  delete from public.pulse_admins where user_id = target.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa cuenta no administra.');
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_revoke', target.id, true, jsonb_build_object('reason', reason, 'handle', target.handle));
  return jsonb_build_object('ok', true, 'handle', target.handle);
end;
$$;

create or replace function public.pulse_admin_save_ally(
  p_admin_key text,
  p_venue_id text,
  p_name text,
  p_zone text,
  p_city text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  ally_name text := trim(coalesce(p_name, ''));
  venue_id text := nullif(trim(coalesce(p_venue_id, '')), '');
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if char_length(ally_name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre del local.');
  end if;
  if venue_id is null then
    venue_id := 'venue_' || substr(md5(gen_random_uuid()::text), 1, 16);
    insert into public.pulse_venues (id, name, zone, city, active)
    values (venue_id, ally_name, trim(coalesce(p_zone, '')), trim(coalesce(p_city, '')), coalesce(p_active, true));
  else
    update public.pulse_venues as venue
    set name = ally_name,
        zone = trim(coalesce(p_zone, venue.zone)),
        city = trim(coalesce(p_city, venue.city)),
        active = coalesce(p_active, venue.active)
    where venue.id = venue_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Ese local no existe.');
    end if;
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_save_ally', venue_id, true, jsonb_build_object('name', ally_name, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'id', venue_id);
end;
$$;

create or replace function public.pulse_admin_save_campaign(
  p_admin_key text,
  p_campaign_id text,
  p_venue_id text,
  p_name text,
  p_points integer,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  campaign_id text := nullif(trim(coalesce(p_campaign_id, '')), '');
  chosen_venue text := trim(coalesce(p_venue_id, ''));
  campaign_name text := trim(coalesce(p_name, ''));
  reward_points integer := coalesce(p_points, 20);
  code text;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if char_length(campaign_name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre de la campaña.');
  end if;
  if reward_points < 1 or reward_points > 500 then
    return jsonb_build_object('ok', false, 'error', 'Los puntos deben estar entre 1 y 500.');
  end if;
  if not exists (select 1 from public.pulse_venues where id = chosen_venue) then
    return jsonb_build_object('ok', false, 'error', 'Elige un local existente.');
  end if;
  if campaign_id is null then
    campaign_id := 'camp_' || substr(md5(gen_random_uuid()::text), 1, 16);
    code := substr(md5(gen_random_uuid()::text), 1, 10);
    insert into public.pulse_campaigns (id, venue_id, name, code, points, active)
    values (campaign_id, chosen_venue, campaign_name, code, reward_points, coalesce(p_active, true));
  else
    update public.pulse_campaigns as campaign
    set venue_id = chosen_venue,
        name = campaign_name,
        points = reward_points,
        active = coalesce(p_active, campaign.active)
    where campaign.id = campaign_id
    returning campaign.code into code;
    if code is null then
      return jsonb_build_object('ok', false, 'error', 'Esa campaña no existe.');
    end if;
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_save_campaign', campaign_id, true, jsonb_build_object('points', reward_points, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'id', campaign_id, 'code', code);
end;
$$;

revoke all on function public.pulse_admin_require_super(text) from public, anon, authenticated;
revoke all on function public.pulse_admin_whoami(text) from public, anon, authenticated;
revoke all on function public.pulse_admin_overview(text) from public, anon, authenticated;
revoke all on function public.pulse_admin_users(text, text, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_preview_result(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.pulse_admin_top_predictors(text) from public, anon, authenticated;
revoke all on function public.pulse_admin_adjust_points(text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_set_suspension(text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_team(text) from public, anon, authenticated;
revoke all on function public.pulse_admin_grant(text, text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_revoke(text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_save_ally(text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.pulse_admin_save_campaign(text, text, text, text, integer, boolean) from public, anon, authenticated;

grant execute on function public.pulse_admin_require_super(text) to service_role;
grant execute on function public.pulse_admin_whoami(text) to service_role;
grant execute on function public.pulse_admin_overview(text) to service_role;
grant execute on function public.pulse_admin_users(text, text, integer, integer, text, text) to service_role;
grant execute on function public.pulse_admin_preview_result(text, text, integer, integer) to service_role;
grant execute on function public.pulse_admin_top_predictors(text) to service_role;
grant execute on function public.pulse_admin_adjust_points(text, text, integer, text, text) to service_role;
grant execute on function public.pulse_admin_set_suspension(text, text, boolean, text) to service_role;
grant execute on function public.pulse_admin_team(text) to service_role;
grant execute on function public.pulse_admin_grant(text, text, text, text) to service_role;
grant execute on function public.pulse_admin_revoke(text, text, text) to service_role;
grant execute on function public.pulse_admin_save_ally(text, text, text, text, text, boolean) to service_role;
grant execute on function public.pulse_admin_save_campaign(text, text, text, text, integer, boolean) to service_role;
