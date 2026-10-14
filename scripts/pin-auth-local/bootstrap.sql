-- Local fixture only. Not a migration.
-- pulse_otp_consume is omitted on purpose: its body is not in the repository.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$roles$;

grant anon, authenticated, service_role to current_user;

create table if not exists public.pulse_profiles (
  id text primary key,
  phone text not null unique,
  alias text not null,
  handle text not null,
  initials text not null,
  avatar_color text not null,
  access_code text not null,
  created_at timestamptz not null default now(),
  city text not null default '',
  alias_normalized text not null,
  full_name text not null default '',
  pin_hash text
);

create unique index if not exists pulse_profiles_alias_normalized_key
  on public.pulse_profiles (alias_normalized);

create table if not exists public.pulse_sessions (
  token text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_participations (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  experience_id text not null,
  game_id text not null,
  type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_transactions (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  experience_id text,
  source_type text not null,
  source_id text not null,
  points integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_completed_missions (
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  mission_id text not null,
  primary key (user_id, mission_id)
);

create table if not exists public.pulse_prediction_picks (
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  game_id text not null,
  option_id text not null,
  primary key (user_id, game_id)
);

create table if not exists public.pulse_extra_games (
  id text primary key,
  game jsonb not null
);

create table if not exists public.pulse_internal_config (
  key text primary key,
  value text not null
);

create table if not exists public.pulse_sim_scenarios (
  id text primary key,
  title text not null
);

grant select, insert, update, delete on public.pulse_sim_scenarios to anon, authenticated;
grant select on public.pulse_participations to anon, authenticated;
grant select on public.pulse_transactions to anon, authenticated;
grant select on public.pulse_completed_missions to anon, authenticated;
grant select on public.pulse_prediction_picks to anon, authenticated;
grant select on public.pulse_extra_games to anon, authenticated;
grant select on public.pulse_internal_config to anon, authenticated;

do $admin_stubs$
declare
  v_name text;
begin
  foreach v_name in array array[
    'pulse_admin_add_event', 'pulse_admin_bingo_close', 'pulse_admin_cancel',
    'pulse_admin_challenge_templates', 'pulse_admin_close_round', 'pulse_admin_create_cycle',
    'pulse_admin_create_match', 'pulse_admin_feature_live', 'pulse_admin_flash_activate',
    'pulse_admin_flash_create', 'pulse_admin_flash_list', 'pulse_admin_flash_resolve',
    'pulse_admin_flash_void', 'pulse_admin_league_list', 'pulse_admin_live_activate',
    'pulse_admin_live_close', 'pulse_admin_live_create', 'pulse_admin_live_list',
    'pulse_admin_live_resolve', 'pulse_admin_live_void', 'pulse_admin_mechanics_summary',
    'pulse_admin_open_live', 'pulse_admin_postpone', 'pulse_admin_prizes',
    'pulse_admin_redeem', 'pulse_admin_rotate_qr', 'pulse_admin_save_bingo_event',
    'pulse_admin_save_venue', 'pulse_admin_save_venue_details', 'pulse_admin_set_broadcasts',
    'pulse_admin_set_challenge_template', 'pulse_admin_set_inning_kind', 'pulse_admin_set_result',
    'pulse_admin_sim_preview', 'pulse_admin_sim_start', 'pulse_admin_sim_status',
    'pulse_admin_sim_stop', 'pulse_admin_simulate_round_close', 'pulse_admin_undo_round_close',
    'pulse_admin_unfeature', 'pulse_admin_upsert_tasca', 'pulse_admin_venues',
    'pulse_reporter_finish', 'pulse_reporter_state', 'pulse_reporter_tap',
    'pulse_trivia_admin_list', 'pulse_trivia_admin_save', 'pulse_trivia_admin_set_status',
    'pulse_cleanup_test', 'pulse_seed_test_scenario', 'pulse_require_admin'
  ]
  loop
    execute format(
      'create or replace function public.%I(p_admin_key text) returns jsonb language sql security definer set search_path to public as $fn$ select jsonb_build_object(''ok'', true) $fn$',
      v_name
    );
    execute format('grant execute on function public.%I(text) to anon, authenticated', v_name);
  end loop;
end
$admin_stubs$;

alter table public.pulse_profiles enable row level security;
alter table public.pulse_sessions enable row level security;

grant select, insert, update, delete on public.pulse_profiles to anon, authenticated;
grant select, insert, update, delete on public.pulse_sessions to anon, authenticated;

create or replace function public.pulse_normalize_phone(raw text)
returns text language plpgsql immutable as $fn$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  if digits like '00%' then digits := substring(digits from 3); end if;
  if length(digits) = 11 and digits like '0%' then digits := '58' || substring(digits from 2); end if;
  if length(digits) = 10 and digits like '4%' then digits := '58' || digits; end if;
  if digits ~ '^58\d{10}$' then return '+' || digits; end if;
  if digits ~ '^[1-9]\d{7,14}$' then return '+' || digits; end if;
  return '';
end;
$fn$;

create or replace function public.pulse_alias_key(raw text)
returns text language sql immutable as $fn$
  select lower(trim(coalesce(raw, '')));
$fn$;

create or replace function public.pulse_pin_valid(p_pin text)
returns boolean language sql immutable as $fn$
  select coalesce(p_pin, '') ~ '^\d{6}$'
    and p_pin not in (
      '000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
      '123456','654321','121212'
    );
$fn$;

create or replace function public.pulse_random_code()
returns text language sql volatile as $fn$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$fn$;

create or replace function public.pulse_initials(alias text)
returns text language sql immutable as $fn$
  select upper(substr(trim(alias), 1, 2));
$fn$;

create or replace function public.pulse_make_handle(alias text)
returns text language plpgsql as $fn$
declare
  base text;
  candidate text;
  n integer := 2;
begin
  base := lower(regexp_replace(trim(alias), '[^a-zA-Z0-9]+', '', 'g'));
  if base = '' then base := 'jugador'; end if;
  candidate := '@' || substr(base, 1, 16);
  while exists (select 1 from public.pulse_profiles where handle = candidate) loop
    candidate := '@' || substr(base, 1, 12) || n::text;
    n := n + 1;
  end loop;
  return candidate;
end;
$fn$;

create or replace function public.pulse_public_profile(profile_row public.pulse_profiles)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object(
    'id', profile_row.id,
    'alias', profile_row.alias,
    'handle', profile_row.handle,
    'initials', profile_row.initials,
    'avatarColor', profile_row.avatar_color
  );
$fn$;

create or replace function public.pulse_profile_private(profile_row public.pulse_profiles)
returns jsonb language sql immutable as $fn$
  select public.pulse_public_profile(profile_row)
    || jsonb_build_object(
      'phone', profile_row.phone,
      'city', coalesce(profile_row.city, ''),
      'fullName', coalesce(profile_row.full_name, '')
    );
$fn$;

create or replace function public.pulse_snapshot(p_user_id text, p_token text)
returns jsonb language plpgsql security definer set search_path to public as $fn$
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
    'users', coalesce((select jsonb_agg(public.pulse_public_profile(p)) from public.pulse_profiles p), '[]'::jsonb),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object('id', part.id, 'userId', part.user_id))
      from public.pulse_participations part where part.user_id = p_user_id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object('id', tx.id, 'userId', tx.user_id, 'points', tx.points))
      from public.pulse_transactions tx where tx.user_id = p_user_id
    ), '[]'::jsonb),
    'completedMissionIds', '[]'::jsonb,
    'predictionPicks', '{}'::jsonb,
    'extraGames', '[]'::jsonb
  );
end;
$fn$;

create or replace function public.pulse_logout(p_token text)
returns jsonb language plpgsql security definer set search_path to public as $fn$
begin
  delete from public.pulse_sessions where token = trim(coalesce(p_token, ''));
  return jsonb_build_object('ok', true, 'code', 'LOGGED_OUT');
end;
$fn$;

create or replace function public.pulse_alias_available(p_alias text)
returns jsonb language plpgsql security definer set search_path to public as $fn$
declare
  v_key text := public.pulse_alias_key(p_alias);
begin
  if exists (select 1 from public.pulse_profiles where alias_normalized = v_key) then
    return jsonb_build_object('ok', true, 'available', false, 'code', 'ALIAS_ALREADY_TAKEN');
  end if;
  return jsonb_build_object('ok', true, 'available', true, 'code', 'ALIAS_AVAILABLE');
end;
$fn$;

create or replace function public.pulse_register(p_phone text, p_alias text)
returns jsonb language plpgsql security definer set search_path to public as $fn$
begin
  return jsonb_build_object('ok', true, 'code', 'LEGACY_OPEN');
end;
$fn$;

create or replace function public.pulse_login(p_phone text, p_access_code text)
returns jsonb language plpgsql security definer set search_path to public as $fn$
begin
  return jsonb_build_object('ok', true, 'code', 'LEGACY_OPEN');
end;
$fn$;

create or replace function public.pulse_otp_finish(p_ticket text, p_alias text, p_city text)
returns jsonb language plpgsql security definer set search_path to public as $fn$
begin
  return jsonb_build_object('ok', true, 'code', 'LEGACY_OPEN');
end;
$fn$;

grant execute on function public.pulse_snapshot(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_profile_private(public.pulse_profiles) to anon, authenticated, service_role;
grant execute on function public.pulse_register(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_login(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_otp_finish(text, text, text) to anon, authenticated, service_role;
