-- Panel central de Rusher y apagado reversible de retos entre usuarios.
-- No borra partidos, pronósticos, puntos ni retos históricos.
-- No modifica credenciales ni códigos de acceso.
-- Las funciones pulse_admin_* nuevas solo las ejecuta service_role, vía /api/admin.
-- Para volver a encender los retos, restaura el cuerpo de
-- pulse_reto_create y pulse_reto_respond desde 20261013013000_reto_lock_not_debit.sql.

-- ── Retos entre usuarios: rechazar altas nuevas ────────────────────────────
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
begin
  return jsonb_build_object('ok', false, 'error', 'Los retos entre usuarios están deshabilitados.');
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
begin
  return jsonb_build_object('ok', false, 'error', 'Los retos entre usuarios están deshabilitados.');
end;
$$;

-- ── Suspensión. No cambia la vigencia actual de las sesiones. ──────────────
alter table public.pulse_profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

create or replace function public.pulse_user_id(p_token text)
returns text
language sql
security definer
set search_path = public
as $$
  select s.user_id
  from public.pulse_sessions s
  join public.pulse_profiles p on p.id = s.user_id
  where s.token = p_token
    and p.suspended_at is null;
$$;

-- ── Campañas QR: una recompensa por usuario y campaña ──────────────────────
create table if not exists public.pulse_campaigns (
  id text primary key,
  venue_id text not null references public.pulse_venues (id) on delete cascade,
  name text not null,
  code text not null unique,
  points integer not null default 20 check (points between 1 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_campaign_opens (
  id text primary key,
  campaign_id text not null references public.pulse_campaigns (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_campaign_rewards (
  campaign_id text not null references public.pulse_campaigns (id) on delete cascade,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  points integer not null,
  new_account boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

alter table public.pulse_campaigns enable row level security;
alter table public.pulse_campaign_opens enable row level security;
alter table public.pulse_campaign_rewards enable row level security;
revoke all on table public.pulse_campaigns from public, anon, authenticated;
revoke all on table public.pulse_campaign_opens from public, anon, authenticated;
revoke all on table public.pulse_campaign_rewards from public, anon, authenticated;

create or replace function public.pulse_admin_actor(p_admin_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_admin_key, '')) not like 'sess_%' then
    raise exception 'Sin permiso.';
  end if;
  return public.pulse_admin_check(trim(p_admin_key));
end;
$$;

revoke all on function public.pulse_admin_actor(text) from public, anon, authenticated;
grant execute on function public.pulse_admin_actor(text) to service_role;

create or replace function public.pulse_campaign_open(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.pulse_campaigns;
  open_id text;
begin
  select * into campaign
  from public.pulse_campaigns
  where code = lower(trim(coalesce(p_code, '')))
    and active;
  if campaign.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa campaña no está activa.');
  end if;
  open_id := 'open_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_campaign_opens (id, campaign_id) values (open_id, campaign.id);
  return jsonb_build_object('ok', true, 'openId', open_id, 'name', campaign.name);
end;
$$;

create or replace function public.pulse_campaign_claim(p_token text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  campaign public.pulse_campaigns;
  profile public.pulse_profiles;
  source text;
  inserted boolean := false;
  fresh boolean := false;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para recibir la recompensa.');
  end if;
  select * into campaign
  from public.pulse_campaigns
  where code = lower(trim(coalesce(p_code, '')))
  for update;
  if campaign.id is null or not campaign.active then
    return jsonb_build_object('ok', false, 'error', 'Esa campaña no está activa.');
  end if;
  if public.pulse_prizes_frozen() then
    return jsonb_build_object('ok', false, 'error', 'Las recompensas están pausadas.');
  end if;
  select * into profile from public.pulse_profiles where id = uid;
  fresh := profile.created_at >= now() - interval '6 hours';
  insert into public.pulse_campaign_rewards (campaign_id, user_id, points, new_account)
  values (campaign.id, uid, campaign.points, fresh)
  on conflict (campaign_id, user_id) do nothing;
  inserted := found;
  if not inserted then
    return jsonb_build_object('ok', true, 'already', true, 'points', 0, 'name', campaign.name);
  end if;
  source := campaign.id || ':' || uid;
  perform public.pulse_credit(
    uid,
    'campaign_reward',
    source,
    campaign.points,
    jsonb_build_object('campaignId', campaign.id, 'venueId', campaign.venue_id, 'code', campaign.code)
  );
  return jsonb_build_object(
    'ok', true,
    'already', false,
    'points', campaign.points,
    'name', campaign.name,
    'newAccount', fresh
  );
end;
$$;

grant execute on function public.pulse_campaign_open(text) to anon, authenticated;
grant execute on function public.pulse_campaign_claim(text, text) to anon, authenticated;

-- ── Consultas del panel ─────────────────────────────────────────────────────
create or replace function public.pulse_admin_overview(p_admin_key text)
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
    'users', (select count(*) from public.pulse_profiles),
    'usersToday', (
      select count(*) from public.pulse_profiles
      where created_at >= (public.pulse_caracas_today()::timestamp at time zone 'America/Caracas')
    ),
    'users7d', (select count(*) from public.pulse_profiles where created_at >= now() - interval '7 days'),
    'users30d', (select count(*) from public.pulse_profiles where created_at >= now() - interval '30 days'),
    'sessionsToday', (
      select count(distinct user_id) from public.pulse_sessions
      where created_at >= (public.pulse_caracas_today()::timestamp at time zone 'America/Caracas')
    ),
    'sessions7d', (
      select count(distinct user_id) from public.pulse_sessions
      where created_at >= now() - interval '7 days'
    ),
    'players', (select count(distinct user_id) from public.pulse_match_predictions),
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
    'venuesActive', (select count(*) from public.pulse_venues where active),
    'campaignsActive', (select count(*) from public.pulse_campaigns where active),
    'campaignAccounts', (select count(*) from public.pulse_campaign_rewards where new_account),
    'qrRewards', (select count(*) from public.pulse_transactions where source_type = 'qr_scan'),
    'campaignRewards', (select count(*) from public.pulse_campaign_rewards),
    'generatedAt', now(),
    'audit', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select a.created_at as at, a.action, a.target, a.ok, pr.handle
        from public.pulse_admin_audit a
        join public.pulse_profiles pr on pr.id = a.user_id
        order by a.created_at desc
        limit 8
      ) item
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(row_to_json(item) order by item.at desc)
      from (
        select at, kind, actor, entity, ok, detail
        from (
          select p.created_at as at, 'register'::text as kind, p.handle as actor, p.handle as entity, true as ok, ''::text as detail
          from public.pulse_profiles p
          order by p.created_at desc
          limit 6
        ) registrations
        union all
        select at, kind, actor, entity, ok, detail
        from (
          select s.created_at as at, 'login'::text as kind, pr.handle as actor, pr.handle as entity, true as ok, ''::text as detail
          from public.pulse_sessions s
          join public.pulse_profiles pr on pr.id = s.user_id
          order by s.created_at desc
          limit 6
        ) sessions
        union all
        select at, kind, actor, entity, ok, detail
        from (
          select a.created_at as at, a.action as kind, pr.handle as actor, coalesce(a.target, '') as entity, a.ok, coalesce(a.details->>'phase', '') as detail
          from public.pulse_admin_audit a
          join public.pulse_profiles pr on pr.id = a.user_id
          order by a.created_at desc
          limit 8
        ) audits
        union all
        select at, kind, actor, entity, ok, detail
        from (
          select r.created_at as at, 'campaign_reward'::text as kind, pr.handle as actor, c.name as entity, true as ok, r.points::text as detail
          from public.pulse_campaign_rewards r
          join public.pulse_profiles pr on pr.id = r.user_id
          join public.pulse_campaigns c on c.id = r.campaign_id
          order by r.created_at desc
          limit 6
        ) rewards
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

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
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
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
      or (stat = 'active' and p.suspended_at is null)
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
          p.phone,
          p.city,
          p.created_at as "createdAt",
          p.prize_eligible as "prizeEligible",
          p.suspended_at as "suspendedAt",
          (
            select max(s.created_at) from public.pulse_sessions s where s.user_id = p.id
          ) as "lastSessionAt",
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
            or (stat = 'active' and p.suspended_at is null)
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

create or replace function public.pulse_admin_user_ledger(
  p_admin_key text,
  p_user_id text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  profile public.pulse_profiles;
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  actor := public.pulse_admin_actor(p_admin_key);
  select * into profile from public.pulse_profiles where id = trim(coalesce(p_user_id, ''));
  if profile.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese usuario no existe.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', profile.id,
      'handle', profile.handle,
      'alias', profile.alias,
      'phone', profile.phone,
      'city', profile.city,
      'createdAt', profile.created_at,
      'prizeEligible', profile.prize_eligible,
      'suspendedAt', profile.suspended_at,
      'suspendedReason', profile.suspended_reason,
      'points', coalesce((select sum(t.points) from public.pulse_transactions t where t.user_id = profile.id), 0)
    ),
    'movements', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select
          t.id,
          t.source_type as type,
          t.points,
          t.created_at as at,
          t.source_id as "sourceId",
          t.metadata->>'matchId' as "matchId",
          t.metadata->>'venueId' as "venueId",
          t.metadata->>'campaignId' as "campaignId",
          t.metadata->>'reason' as reason
        from public.pulse_transactions t
        where t.user_id = profile.id
        order by t.created_at desc
        limit lim
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_admin_match_board(
  p_admin_key text,
  p_status text,
  p_team text,
  p_from text,
  p_to text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  off integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
  team text := trim(coalesce(p_team, ''));
  stat text := trim(coalesce(p_status, ''));
  from_at timestamptz := nullif(trim(coalesce(p_from, '')), '')::timestamptz;
  to_at timestamptz := nullif(trim(coalesce(p_to, '')), '')::timestamptz;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'matches', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select
          m.id,
          m.home_team as "homeTeam",
          m.away_team as "awayTeam",
          m.starts_at as "startsAt",
          m.status,
          m.home_score as "homeScore",
          m.away_score as "awayScore",
          (select count(*) from public.pulse_match_predictions p where p.match_id = m.id) as predictions,
          (select count(*) from public.pulse_match_predictions p where p.match_id = m.id and p.processed_at is not null) as processed,
          coalesce((
            select sum(tx.points)
            from public.pulse_transactions tx
            join public.pulse_match_predictions p on p.id = tx.source_id
            where tx.source_type = 'prediction' and p.match_id = m.id
          ), 0) as points
        from public.pulse_matches m
        where coalesce(m.is_simulation, false) = false
          and coalesce(m.is_demo, false) = false
          and (stat = '' or m.status = stat)
          and (team = '' or m.home_team ilike '%' || team || '%' or m.away_team ilike '%' || team || '%')
          and (from_at is null or m.starts_at >= from_at)
          and (to_at is null or m.starts_at < to_at)
        order by m.starts_at desc
        limit lim offset off
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_admin_ledger(
  p_admin_key text,
  p_type text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  off integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
  kind text := trim(coalesce(p_type, ''));
begin
  actor := public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'movements', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select
          t.id,
          t.user_id as "userId",
          pr.handle,
          t.source_type as type,
          t.points,
          t.created_at as at,
          t.source_id as "sourceId",
          t.metadata->>'matchId' as "matchId",
          t.metadata->>'venueId' as "venueId",
          t.metadata->>'campaignId' as "campaignId",
          t.metadata->>'reason' as reason,
          t.metadata->>'adminId' as "adminId"
        from public.pulse_transactions t
        join public.pulse_profiles pr on pr.id = t.user_id
        where kind = '' or t.source_type = kind
        order by t.created_at desc
        limit lim offset off
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_admin_audit_recent(p_admin_key text, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  actor := public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'events', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select a.created_at as at, a.action, a.target, a.ok, pr.handle, a.details->>'phase' as phase
        from public.pulse_admin_audit a
        join public.pulse_profiles pr on pr.id = a.user_id
        order by a.created_at desc
        limit lim
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
  actor := public.pulse_admin_actor(p_admin_key);
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
  actor := public.pulse_admin_actor(p_admin_key);
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
  actor := public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'admins', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select pr.handle, pr.alias, a.granted_at as "grantedAt", a.granted_by as "grantedBy"
        from public.pulse_admins a
        join public.pulse_profiles pr on pr.id = a.user_id
        order by a.granted_at
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_admin_grant(
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
  matches integer;
  target public.pulse_profiles;
begin
  actor := public.pulse_admin_actor(p_admin_key);
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
  insert into public.pulse_admins (user_id, granted_by)
  values (target.id, actor)
  on conflict (user_id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'already', true, 'handle', target.handle);
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_grant', target.id, true, jsonb_build_object('reason', reason, 'handle', target.handle));
  return jsonb_build_object('ok', true, 'already', false, 'handle', target.handle);
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
  name text := trim(coalesce(p_name, ''));
  venue_id text := nullif(trim(coalesce(p_venue_id, '')), '');
begin
  actor := public.pulse_admin_actor(p_admin_key);
  if char_length(name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre del local.');
  end if;
  if venue_id is null then
    venue_id := 'venue_' || substr(md5(gen_random_uuid()::text), 1, 16);
    insert into public.pulse_venues (id, name, zone, city, active)
    values (venue_id, name, trim(coalesce(p_zone, '')), trim(coalesce(p_city, '')), coalesce(p_active, true));
  else
    update public.pulse_venues
    set name = name,
        zone = trim(coalesce(p_zone, zone)),
        city = trim(coalesce(p_city, city)),
        active = coalesce(p_active, active)
    where id = venue_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Ese local no existe.');
    end if;
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_save_ally', venue_id, true, jsonb_build_object('name', name, 'active', coalesce(p_active, true)));
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
  venue_id text := trim(coalesce(p_venue_id, ''));
  name text := trim(coalesce(p_name, ''));
  points integer := coalesce(p_points, 20);
  code text;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  if char_length(name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre de la campaña.');
  end if;
  if points < 1 or points > 500 then
    return jsonb_build_object('ok', false, 'error', 'Los puntos deben estar entre 1 y 500.');
  end if;
  if not exists (select 1 from public.pulse_venues where id = venue_id) then
    return jsonb_build_object('ok', false, 'error', 'Elige un local existente.');
  end if;
  if campaign_id is null then
    campaign_id := 'camp_' || substr(md5(gen_random_uuid()::text), 1, 16);
    code := substr(md5(gen_random_uuid()::text), 1, 10);
    insert into public.pulse_campaigns (id, venue_id, name, code, points, active)
    values (campaign_id, venue_id, name, code, points, coalesce(p_active, true));
  else
    update public.pulse_campaigns
    set venue_id = venue_id,
        name = name,
        points = points,
        active = coalesce(p_active, active)
    where id = campaign_id
    returning pulse_campaigns.code into code;
    if code is null then
      return jsonb_build_object('ok', false, 'error', 'Esa campaña no existe.');
    end if;
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_save_campaign', campaign_id, true, jsonb_build_object('points', points, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'id', campaign_id, 'code', code);
end;
$$;

create or replace function public.pulse_admin_allies(p_admin_key text)
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
    'venues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'name', v.name,
        'zone', v.zone,
        'city', v.city,
        'active', v.active,
        'scans', (select count(*) from public.pulse_qr_scans s where s.venue_id = v.id),
        'qrRewards', (
          select count(*) from public.pulse_transactions t
          where t.source_type = 'qr_scan' and t.metadata->>'venueId' = v.id
        )
      ) order by v.name)
      from public.pulse_venues v
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'venueId', c.venue_id,
        'venue', v.name,
        'name', c.name,
        'code', c.code,
        'points', c.points,
        'active', c.active,
        'opens', (select count(*) from public.pulse_campaign_opens o where o.campaign_id = c.id),
        'rewards', (select count(*) from public.pulse_campaign_rewards r where r.campaign_id = c.id),
        'newAccounts', (select count(*) from public.pulse_campaign_rewards r where r.campaign_id = c.id and r.new_account)
      ) order by c.created_at desc)
      from public.pulse_campaigns c
      join public.pulse_venues v on v.id = c.venue_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pulse_admin_overview(text) from public, anon, authenticated;
revoke all on function public.pulse_admin_users(text, text, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_user_ledger(text, text, integer) from public, anon, authenticated;
revoke all on function public.pulse_admin_match_board(text, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.pulse_admin_ledger(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.pulse_admin_audit_recent(text, integer) from public, anon, authenticated;
revoke all on function public.pulse_admin_adjust_points(text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_set_suspension(text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_team(text) from public, anon, authenticated;
revoke all on function public.pulse_admin_grant(text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_save_ally(text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.pulse_admin_save_campaign(text, text, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.pulse_admin_allies(text) from public, anon, authenticated;

grant execute on function public.pulse_admin_overview(text) to service_role;
grant execute on function public.pulse_admin_users(text, text, integer, integer, text, text) to service_role;
grant execute on function public.pulse_admin_user_ledger(text, text, integer) to service_role;
grant execute on function public.pulse_admin_match_board(text, text, text, text, text, integer, integer) to service_role;
grant execute on function public.pulse_admin_ledger(text, text, integer, integer) to service_role;
grant execute on function public.pulse_admin_audit_recent(text, integer) to service_role;
grant execute on function public.pulse_admin_adjust_points(text, text, integer, text, text) to service_role;
grant execute on function public.pulse_admin_set_suspension(text, text, boolean, text) to service_role;
grant execute on function public.pulse_admin_team(text) to service_role;
grant execute on function public.pulse_admin_grant(text, text, text) to service_role;
grant execute on function public.pulse_admin_save_ally(text, text, text, text, text, boolean) to service_role;
grant execute on function public.pulse_admin_save_campaign(text, text, text, text, integer, boolean) to service_role;
grant execute on function public.pulse_admin_allies(text) to service_role;
