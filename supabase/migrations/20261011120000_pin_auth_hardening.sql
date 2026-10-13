-- PIN auth hardening. Forward-only. Do not apply with db push to production.
-- pulse_otp_consume is not defined anywhere in this repository. This migration
-- does not replace it and does not guess its body. expires_at has a default so
-- an insert that omits the column still succeeds.
--
-- Session inserts found in this repository:
--   pulse_account_register, pulse_account_login (replaced below, expires_at explicit)
--   pulse_register, pulse_login (replaced with stubs that do not insert)
--   pulse_direct_enter in 20261004130000_direct_enter_bypass.sql inserts, and
--   20261004160000_pin_accounts.sql already replaces that function with a stub
--   that does not insert. This migration leaves that stub alone.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
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
$$;

alter table public.pulse_sessions
  add column if not exists expires_at timestamptz;

update public.pulse_sessions
set expires_at = created_at + interval '30 days'
where expires_at is null;

alter table public.pulse_sessions
  alter column expires_at set default (now() + interval '30 days');

alter table public.pulse_sessions
  alter column expires_at set not null;

create table if not exists public.pulse_pin_attempts (
  phone_hmac text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  next_allowed_at timestamptz not null default now(),
  lock_level integer not null default 0,
  lock_raised_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pulse_pin_attempts
  add column if not exists lock_level integer not null default 0,
  add column if not exists lock_raised_at timestamptz;

create table if not exists public.pulse_auth_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null,
  reason text not null,
  phone_hmac text
);

create table if not exists public.pulse_pin_challenges (
  id uuid primary key default gen_random_uuid(),
  phone_hmac text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pulse_pin_attempts enable row level security;
alter table public.pulse_auth_events enable row level security;
alter table public.pulse_pin_challenges enable row level security;

revoke all on table public.pulse_pin_attempts from public, anon, authenticated;
revoke all on table public.pulse_auth_events from public, anon, authenticated;
revoke all on table public.pulse_pin_challenges from public, anon, authenticated;

insert into public.pulse_internal_config (key, value)
values ('pin_bcrypt_cost', '10')
on conflict (key) do update set value = excluded.value;

insert into public.pulse_internal_config (key, value)
values ('pin_hmac_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

insert into public.pulse_internal_config (key, value)
values (
  'pin_dummy_hash',
  extensions.crypt(
    encode(extensions.gen_random_bytes(32), 'hex'),
    extensions.gen_salt('bf', '10'::integer)
  )
)
on conflict (key) do nothing;

create or replace function public.pulse_auth_note(p_event text, p_reason text, p_phone text)
returns void
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_key text;
begin
  select value into v_key from public.pulse_internal_config where key = 'pin_hmac_key';
  insert into public.pulse_auth_events (event, reason, phone_hmac)
  values (
    p_event,
    p_reason,
    case
      when p_phone is null or coalesce(v_key, '') = '' then null
      else encode(extensions.hmac(p_phone, v_key, 'sha256'), 'hex')
    end
  );
end;
$$;

create or replace function public.pulse_phone_hmac(p_phone text)
returns text
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_key text;
begin
  select value into v_key from public.pulse_internal_config where key = 'pin_hmac_key';
  if coalesce(v_key, '') = '' or coalesce(p_phone, '') = '' then
    return null;
  end if;
  return encode(extensions.hmac(p_phone, v_key, 'sha256'), 'hex');
end;
$$;

revoke all on function public.pulse_auth_note(text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_phone_hmac(text) from public, anon, authenticated;
grant execute on function public.pulse_auth_note(text, text, text) to service_role;
grant execute on function public.pulse_phone_hmac(text) to service_role;

create or replace function public.pulse_account_register(
  p_phone text,
  p_full_name text,
  p_alias text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_phone text;
  v_full text;
  v_alias text;
  v_key text;
  v_constraint text;
  v_cost integer;
  profile public.pulse_profiles;
  token text;
  colors text[] := array['#18A085', '#FF6B4A', '#5C4DDB', '#1F9D62', '#E0A106', '#0D7A65'];
  color_count integer;
begin
  v_phone := public.pulse_normalize_phone(p_phone);
  if v_phone = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PHONE', 'error', 'Revisa el número de teléfono.');
  end if;

  v_full := trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  if length(v_full) < 2 or length(v_full) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FULL_NAME', 'error', 'Escribe tu nombre completo.');
  end if;

  if not public.pulse_pin_valid(p_pin) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PIN', 'error', 'El PIN debe tener 6 números y no ser una secuencia obvia.');
  end if;

  v_alias := trim(coalesce(p_alias, ''));
  v_key := public.pulse_alias_key(v_alias);
  if v_key !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ALIAS', 'error', 'Usa de 3 a 20 letras, números o _. Sin espacios.');
  end if;

  if exists (select 1 from public.pulse_profiles pr where pr.phone = v_phone) then
    perform public.pulse_auth_note('pin_register', 'PHONE_TAKEN', v_phone);
    return jsonb_build_object('ok', false, 'code', 'REGISTER_REJECTED', 'error', 'No pudimos crear la cuenta. Revisa los datos o entra con tu PIN.');
  end if;
  if exists (select 1 from public.pulse_profiles pr where pr.alias_normalized = v_key) then
    perform public.pulse_auth_note('pin_register', 'ALIAS_TAKEN', v_phone);
    return jsonb_build_object('ok', false, 'code', 'REGISTER_REJECTED', 'error', 'No pudimos crear la cuenta. Revisa los datos o entra con tu PIN.');
  end if;

  select value::integer into v_cost from public.pulse_internal_config where key = 'pin_bcrypt_cost';
  if v_cost is null or v_cost < 4 or v_cost > 12 then
    v_cost := 10;
  end if;

  select count(*) into color_count from public.pulse_profiles;
  profile.id := 'user_' || replace(gen_random_uuid()::text, '-', '');
  profile.phone := v_phone;
  profile.alias := v_alias;
  profile.handle := public.pulse_make_handle(v_alias);
  profile.initials := public.pulse_initials(v_alias);
  profile.avatar_color := colors[1 + (color_count % array_length(colors, 1))];
  profile.access_code := public.pulse_random_code();
  profile.city := 'Caracas';
  profile.alias_normalized := v_key;
  profile.full_name := v_full;
  profile.pin_hash := extensions.crypt(p_pin, extensions.gen_salt('bf', v_cost));

  begin
    insert into public.pulse_profiles (
      id, phone, alias, handle, initials, avatar_color, access_code, city, alias_normalized, full_name, pin_hash
    )
    values (
      profile.id, profile.phone, profile.alias, profile.handle, profile.initials,
      profile.avatar_color, profile.access_code, profile.city, profile.alias_normalized, profile.full_name, profile.pin_hash
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('pulse_profiles_phone_key', 'pulse_profiles_phone_normalized_uidx') then
        perform public.pulse_auth_note('pin_register', 'PHONE_TAKEN', v_phone);
      else
        perform public.pulse_auth_note('pin_register', 'ALIAS_TAKEN', v_phone);
      end if;
      return jsonb_build_object('ok', false, 'code', 'REGISTER_REJECTED', 'error', 'No pudimos crear la cuenta. Revisa los datos o entra con tu PIN.');
  end;

  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id, expires_at)
  values (token, profile.id, now() + interval '30 days');
  return public.pulse_snapshot(profile.id, token)
    || jsonb_build_object('isNew', true, 'code', 'PROFILE_CREATED');
end;
$$;

create or replace function public.pulse_account_login(p_phone text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_phone text;
  v_hmac text;
  v_cost integer;
  v_dummy text;
  v_stored text;
  v_stored_cost integer;
  v_profile_id text;
  v_seen text;
  v_rehash text;
  attempt public.pulse_pin_attempts;
  token text;
  v_match boolean := false;
  v_reason text := 'PIN_MISMATCH';
  v_check text;
  v_lock_start timestamptz;
  v_pad text;
  v_new_level integer := 0;
  v_step interval := interval '15 minutes';
begin
  select value into v_dummy from public.pulse_internal_config where key = 'pin_dummy_hash';
  select value::integer into v_cost from public.pulse_internal_config where key = 'pin_bcrypt_cost';
  if v_cost is null or v_cost < 4 or v_cost > 12 then
    v_cost := 10;
  end if;
  if coalesce(v_dummy, '') = '' then
    v_dummy := extensions.crypt(encode(extensions.gen_random_bytes(16), 'hex'), extensions.gen_salt('bf', v_cost));
  end if;

  v_phone := public.pulse_normalize_phone(p_phone);
  if v_phone = '' or coalesce(p_pin, '') !~ '^\d{6}$' then
    perform extensions.crypt(coalesce(p_pin, '0'), v_dummy);
    perform extensions.crypt(coalesce(p_pin, '0'), v_dummy);
    perform public.pulse_auth_note('pin_login', 'MALFORMED', null);
    return jsonb_build_object('ok', false, 'code', 'PIN_INVALID', 'error', 'El número o PIN no son correctos.');
  end if;

  v_hmac := public.pulse_phone_hmac(v_phone);
  select pr.id, pr.pin_hash into v_profile_id, v_stored
  from public.pulse_profiles pr
  where pr.phone = v_phone;

  v_check := extensions.crypt(p_pin, coalesce(v_stored, v_dummy));
  v_pad := extensions.crypt(p_pin, v_dummy);
  v_stored_cost := substring(v_stored from '^\$2[aby]\$([0-9]{2})\$')::integer;
  if v_stored_cost is not null and v_stored_cost < v_cost then
    v_rehash := extensions.crypt(p_pin, extensions.gen_salt('bf', v_cost));
  end if;

  v_match := v_profile_id is not null
    and v_stored is not null
    and v_check is not distinct from v_stored;

  perform pg_advisory_xact_lock(hashtextextended('pin:' || v_hmac, 481516));
  v_lock_start := clock_timestamp();

  insert into public.pulse_pin_attempts (phone_hmac)
  values (v_hmac)
  on conflict (phone_hmac) do nothing;

  select * into attempt
  from public.pulse_pin_attempts
  where phone_hmac = v_hmac
  for update;

  if attempt.window_started_at < now() - interval '15 minutes'
     and attempt.next_allowed_at <= now() then
    update public.pulse_pin_attempts
    set failures = 0,
        window_started_at = now(),
        next_allowed_at = now(),
        updated_at = now()
    where phone_hmac = v_hmac
    returning * into attempt;
  end if;

  if v_match then
    select pin_hash into v_seen from public.pulse_profiles where id = v_profile_id;
    if v_seen is not distinct from v_stored then
      if v_rehash is not null then
        update public.pulse_profiles
        set pin_hash = v_rehash
        where id = v_profile_id
          and pin_hash = v_stored;
      end if;

      update public.pulse_pin_attempts
      set failures = 0,
          window_started_at = now(),
          next_allowed_at = now(),
          lock_level = 0,
          lock_raised_at = null,
          updated_at = now()
      where phone_hmac = v_hmac;

      token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
      insert into public.pulse_sessions (token, user_id, expires_at)
      values (token, v_profile_id, now() + interval '30 days');

      perform public.pulse_auth_note('pin_login', 'OK', v_phone);
      perform public.pulse_auth_note('pin_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
      return public.pulse_snapshot(v_profile_id, token)
        || jsonb_build_object('isNew', false, 'code', 'SESSION_CREATED');
    end if;
  end if;

  if v_profile_id is null then
    v_reason := 'NO_ACCOUNT';
  elsif v_stored is null then
    v_reason := 'PIN_NOT_SET';
  else
    v_reason := 'PIN_MISMATCH';
  end if;

  if attempt.next_allowed_at > now() then
    perform public.pulse_auth_note('pin_login', 'THROTTLED', v_phone);
    perform public.pulse_auth_note('pin_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
    return jsonb_build_object(
      'ok', false,
      'code', 'PIN_RATE_LIMITED',
      'error', 'Demasiados intentos. Espera unos minutos.',
      'retryAfter', ceil(extract(epoch from (attempt.next_allowed_at - now())))::integer
    );
  end if;

  v_new_level := attempt.lock_level;
  v_step := interval '15 minutes';
  if attempt.failures + 1 >= 5 then
    if attempt.lock_level = 0
       or attempt.lock_raised_at is null
       or attempt.lock_raised_at < now() - interval '24 hours' then
      v_new_level := 1;
      v_step := interval '15 minutes';
    elsif attempt.lock_level = 1 then
      v_new_level := 2;
      v_step := interval '1 hour';
    else
      v_new_level := 3;
      v_step := interval '24 hours';
    end if;
  end if;

  update public.pulse_pin_attempts
  set failures = failures + 1,
      lock_level = v_new_level,
      lock_raised_at = case
        when v_new_level is distinct from lock_level then now()
        else lock_raised_at
      end,
      next_allowed_at = case
        when failures + 1 >= 5 then now() + v_step
        else next_allowed_at
      end,
      updated_at = now()
  where phone_hmac = v_hmac;

  if v_new_level > attempt.lock_level then
    perform public.pulse_auth_note('pin_lock_level', v_new_level::text, v_phone);
  end if;

  perform public.pulse_auth_note('pin_login', v_reason, v_phone);
  perform public.pulse_auth_note('pin_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
  return jsonb_build_object('ok', false, 'code', 'PIN_INVALID', 'error', 'El número o PIN no son correctos.');
end;
$$;

create or replace function public.pulse_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  session_row public.pulse_sessions;
  v_token text := trim(coalesce(p_token, ''));
begin
  if v_token = '' then
    perform public.pulse_auth_note('pin_load', 'INVALID_TOKEN', null);
    return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'error', 'La sesión expiró. Entra de nuevo.');
  end if;

  select * into session_row from public.pulse_sessions where token = v_token;
  if session_row.token is null or session_row.expires_at <= now() then
    delete from public.pulse_sessions where token = v_token;
    perform public.pulse_auth_note(
      'pin_load',
      case when session_row.token is null then 'INVALID_TOKEN' else 'EXPIRED' end,
      null
    );
    return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'error', 'La sesión expiró. Entra de nuevo.');
  end if;

  return public.pulse_snapshot(session_row.user_id, session_row.token);
end;
$$;

create or replace function public.pulse_pin_recovery_start(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_phone text;
  v_hmac text;
  v_cost integer;
  v_hour integer;
  v_day integer;
  v_bytes bytea;
  v_n bigint;
  v_code text;
  v_hash text;
  v_profile_id text;
  v_lock_start timestamptz;
begin
  select value::integer into v_cost from public.pulse_internal_config where key = 'pin_bcrypt_cost';
  if v_cost is null or v_cost < 4 or v_cost > 12 then
    v_cost := 10;
  end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_n := (get_byte(v_bytes, 0)::bigint * 16777216)
       + (get_byte(v_bytes, 1)::bigint * 65536)
       + (get_byte(v_bytes, 2)::bigint * 256)
       + get_byte(v_bytes, 3)::bigint;
  v_code := lpad((mod(v_n, 1000000))::text, 6, '0');
  v_hash := extensions.crypt(v_code, extensions.gen_salt('bf', v_cost));

  v_phone := public.pulse_normalize_phone(p_phone);
  if v_phone = '' then
    perform public.pulse_auth_note('pin_recovery_start', 'MALFORMED', null);
    return jsonb_build_object('ok', true, 'deliver', false);
  end if;

  v_hmac := public.pulse_phone_hmac(v_phone);
  perform pg_advisory_xact_lock(hashtextextended('recover:' || v_hmac, 481516));
  v_lock_start := clock_timestamp();

  select count(*) into v_hour
  from public.pulse_pin_challenges
  where phone_hmac = v_hmac and created_at > now() - interval '1 hour';

  select count(*) into v_day
  from public.pulse_pin_challenges
  where phone_hmac = v_hmac and created_at > now() - interval '24 hours';

  select id into v_profile_id from public.pulse_profiles where phone = v_phone;

  if v_profile_id is null or v_hour >= 3 or v_day >= 5 then
    perform public.pulse_auth_note(
      'pin_recovery_start',
      case
        when v_profile_id is null then 'NO_ACCOUNT'
        when v_hour >= 3 then 'HOUR_CAP'
        else 'DAY_CAP'
      end,
      v_phone
    );
    perform public.pulse_auth_note('pin_recovery_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
    return jsonb_build_object('ok', true, 'deliver', false);
  end if;

  insert into public.pulse_pin_challenges (phone_hmac, code_hash, expires_at)
  values (v_hmac, v_hash, now() + interval '10 minutes');

  perform public.pulse_auth_note('pin_recovery_start', 'ISSUED', v_phone);
  perform public.pulse_auth_note('pin_recovery_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
  return jsonb_build_object('ok', true, 'deliver', true, 'phone', v_phone, 'otp', v_code);
end;
$$;

create or replace function public.pulse_pin_commit(p_phone text, p_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_phone text;
  v_hmac text;
  v_cost integer;
  challenge public.pulse_pin_challenges;
  profile public.pulse_profiles;
  token text;
begin
  v_phone := public.pulse_normalize_phone(p_phone);
  if v_phone = '' or coalesce(p_code, '') !~ '^\d{6}$' or not public.pulse_pin_valid(p_pin) then
    perform public.pulse_auth_note('pin_commit', 'MALFORMED', null);
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_FAILED', 'error', 'No pudimos verificar el código.');
  end if;

  v_hmac := public.pulse_phone_hmac(v_phone);
  perform pg_advisory_xact_lock(hashtextextended('recover:' || v_hmac, 481516));

  select * into profile from public.pulse_profiles where phone = v_phone;
  if profile.id is null then
    perform public.pulse_auth_note('pin_commit', 'NO_ACCOUNT', v_phone);
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_FAILED', 'error', 'No pudimos verificar el código.');
  end if;

  select * into challenge
  from public.pulse_pin_challenges
  where phone_hmac = v_hmac
    and used_at is null
  order by created_at desc
  limit 1
  for update;

  if challenge.id is null or challenge.expires_at <= now() or challenge.attempts >= 5 then
    perform public.pulse_auth_note(
      'pin_commit',
      case
        when challenge.id is null then 'NO_CHALLENGE'
        when challenge.attempts >= 5 then 'ATTEMPTS'
        else 'EXPIRED'
      end,
      v_phone
    );
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_FAILED', 'error', 'No pudimos verificar el código.');
  end if;

  if extensions.crypt(p_code, challenge.code_hash) is distinct from challenge.code_hash then
    update public.pulse_pin_challenges
    set attempts = attempts + 1
    where id = challenge.id;
    perform public.pulse_auth_note('pin_commit', 'BAD_CODE', v_phone);
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_FAILED', 'error', 'No pudimos verificar el código.');
  end if;

  select value::integer into v_cost from public.pulse_internal_config where key = 'pin_bcrypt_cost';
  if v_cost is null or v_cost < 4 or v_cost > 12 then
    v_cost := 10;
  end if;

  update public.pulse_profiles
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', v_cost))
  where id = profile.id;

  update public.pulse_pin_challenges
  set used_at = now()
  where id = challenge.id;

  delete from public.pulse_sessions where user_id = profile.id;

  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id, expires_at)
  values (token, profile.id, now() + interval '30 days');

  update public.pulse_pin_attempts
  set failures = 0,
      window_started_at = now(),
      next_allowed_at = now(),
      lock_level = 0,
      lock_raised_at = null,
      updated_at = now()
  where phone_hmac = v_hmac;

  perform public.pulse_auth_note('pin_commit', 'OK', v_phone);
  return public.pulse_snapshot(profile.id, token)
    || jsonb_build_object('ok', true, 'code', 'PIN_SET');
end;
$$;

create or replace function public.pulse_register(p_phone text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.pulse_auth_note('legacy_register', 'DISABLED', null);
  return jsonb_build_object('ok', false, 'code', 'LEGACY_AUTH_DISABLED', 'error', 'Crea tu cuenta con teléfono, alias y PIN.');
end;
$$;

create or replace function public.pulse_login(p_phone text, p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.pulse_auth_note('legacy_login', 'DISABLED', null);
  return jsonb_build_object('ok', false, 'code', 'LEGACY_AUTH_DISABLED', 'error', 'Entra con tu teléfono y tu PIN.');
end;
$$;

create or replace function public.pulse_otp_finish(p_ticket text, p_alias text, p_city text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.pulse_auth_note('otp_finish', 'DISABLED', null);
  return jsonb_build_object('ok', false, 'code', 'LEGACY_AUTH_DISABLED', 'error', 'Crea tu cuenta con teléfono, alias y PIN.');
end;
$$;

revoke all on function public.pulse_register(text, text) from public, anon, authenticated;
revoke all on function public.pulse_login(text, text) from public, anon, authenticated;
revoke all on function public.pulse_otp_finish(text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_snapshot(text, text) from public, anon, authenticated;
revoke all on function public.pulse_profile_private(public.pulse_profiles) from public, anon, authenticated;
revoke all on function public.pulse_pin_recovery_start(text) from public, anon, authenticated;
revoke all on function public.pulse_pin_commit(text, text, text) from public, anon, authenticated;

grant execute on function public.pulse_pin_recovery_start(text) to service_role;
grant execute on function public.pulse_pin_commit(text, text, text) to service_role;
grant execute on function public.pulse_snapshot(text, text) to service_role;

revoke all on function public.pulse_account_login(text, text) from public;
revoke all on function public.pulse_account_register(text, text, text, text) from public;
revoke all on function public.pulse_load(text) from public;
revoke all on function public.pulse_logout(text) from public;
revoke all on function public.pulse_alias_available(text) from public;

revoke all on function public.pulse_account_login(text, text) from anon, authenticated;
revoke all on function public.pulse_account_register(text, text, text, text) from anon, authenticated;
revoke all on function public.pulse_logout(text) from anon, authenticated;

grant execute on function public.pulse_account_login(text, text) to service_role;
grant execute on function public.pulse_account_register(text, text, text, text) to service_role;
grant execute on function public.pulse_load(text) to anon, authenticated, service_role;
grant execute on function public.pulse_logout(text) to service_role;
grant execute on function public.pulse_alias_available(text) to anon, authenticated, service_role;

revoke all on function public.pulse_auth_note(text, text, text) from public, anon, authenticated;
grant execute on function public.pulse_auth_note(text, text, text) to service_role;

do $revoke_provider$
begin
  if to_regprocedure('public.pulse_otp_provider(text)') is not null then
    revoke all on function public.pulse_otp_provider(text) from public, anon, authenticated;
    grant execute on function public.pulse_otp_provider(text) to service_role;
  end if;
end
$revoke_provider$;

revoke all on table public.pulse_profiles from public, anon, authenticated;
revoke all on table public.pulse_sessions from public, anon, authenticated;
revoke all on table public.pulse_internal_config from public, anon, authenticated;
revoke all on table public.pulse_pin_attempts from public, anon, authenticated;
revoke all on table public.pulse_auth_events from public, anon, authenticated;
revoke all on table public.pulse_pin_challenges from public, anon, authenticated;

insert into public.pulse_internal_config (key, value)
values
  ('pin_ip_max', '20'),
  ('pin_ip_window_sec', '600'),
  ('pin_global_fail_per_min', '40'),
  ('pin_global_reserve', '25')
on conflict (key) do update set value = excluded.value;

create or replace function public.pulse_auth_purge()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_events integer;
  v_attempts integer;
  v_challenges integer;
  v_sessions integer;
begin
  delete from public.pulse_auth_events
  where created_at < now() - interval '90 days';
  get diagnostics v_events = row_count;

  delete from public.pulse_pin_attempts
  where updated_at < now() - interval '90 days'
    and next_allowed_at <= now()
    and lock_level = 0;
  get diagnostics v_attempts = row_count;

  delete from public.pulse_pin_challenges
  where expires_at < now() - interval '1 day';
  get diagnostics v_challenges = row_count;

  delete from public.pulse_sessions
  where expires_at < now();
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'ok', true,
    'events', v_events,
    'attempts', v_attempts,
    'challenges', v_challenges,
    'sessions', v_sessions
  );
end;
$$;

revoke all on function public.pulse_auth_purge() from public, anon, authenticated;
grant execute on function public.pulse_auth_purge() to service_role;

do $otp_caps$
begin
  if to_regclass('public.pulse_otp_challenges') is null then
    return;
  end if;

  execute 'alter table public.pulse_otp_challenges add column if not exists day_send_count integer not null default 0';
  execute 'alter table public.pulse_otp_challenges add column if not exists day_started_at timestamptz';

  execute $fn$
    create or replace function public.pulse_otp_issue(p_phone text, p_code text, p_secret text)
    returns jsonb
    language plpgsql
    security definer
    set search_path to public, extensions
    as $body$
    declare
      v_phone text;
      v_row public.pulse_otp_challenges;
      v_wait integer;
      v_hour integer;
      v_day integer;
    begin
      perform public.pulse_require_otp_secret(p_secret);
      v_phone := public.pulse_normalize_phone(p_phone);
      if v_phone = '' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_PHONE', 'error', 'Revisa el número de teléfono.');
      end if;
      if p_code !~ '^\d{6}$' then
        return jsonb_build_object('ok', false, 'code', 'REGISTRATION_ERROR', 'error', 'No se pudo preparar el código.');
      end if;

      select * into v_row from public.pulse_otp_challenges where phone = v_phone;
      v_hour := 0;
      v_day := 0;
      if v_row.phone is not null then
        if v_row.last_sent_at > now() - interval '30 seconds' then
          v_wait := ceil(extract(epoch from (v_row.last_sent_at + interval '30 seconds' - now())))::integer;
          return jsonb_build_object(
            'ok', false,
            'code', 'OTP_RATE_LIMITED',
            'retryAfter', greatest(v_wait, 1),
            'error', 'Espera unos segundos antes de pedir otro código.'
          );
        end if;
        if v_row.created_at > now() - interval '1 hour' then
          v_hour := v_row.send_count;
        end if;
        if v_row.day_started_at > now() - interval '24 hours' then
          v_day := v_row.day_send_count;
        end if;
        if v_hour >= 3 or v_day >= 5 then
          return jsonb_build_object(
            'ok', false,
            'code', 'OTP_RATE_LIMITED',
            'retryAfter', 3600,
            'error', 'Has solicitado demasiados códigos. Espera unos minutos antes de intentarlo nuevamente.'
          );
        end if;
      end if;

      insert into public.pulse_otp_challenges (
        phone, code_hash, expires_at, attempts, send_count, last_sent_at, created_at, day_send_count, day_started_at
      )
      values (
        v_phone,
        crypt(p_code, gen_salt('bf')),
        now() + interval '10 minutes',
        0,
        1,
        now(),
        now(),
        1,
        now()
      )
      on conflict (phone) do update set
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        send_count = case
          when pulse_otp_challenges.created_at > now() - interval '1 hour' then pulse_otp_challenges.send_count + 1
          else 1
        end,
        last_sent_at = now(),
        created_at = case
          when pulse_otp_challenges.created_at > now() - interval '1 hour' then pulse_otp_challenges.created_at
          else now()
        end,
        day_send_count = case
          when pulse_otp_challenges.day_started_at > now() - interval '24 hours' then pulse_otp_challenges.day_send_count + 1
          else 1
        end,
        day_started_at = case
          when pulse_otp_challenges.day_started_at > now() - interval '24 hours' then pulse_otp_challenges.day_started_at
          else now()
        end;

      return jsonb_build_object(
        'ok', true,
        'code', 'OTP_SENT',
        'phone', v_phone,
        'isNew', not exists (select 1 from public.pulse_profiles pr where pr.phone = v_phone)
      );
    end;
    $body$;
  $fn$;

  execute 'revoke all on function public.pulse_otp_issue(text, text, text) from public, anon, authenticated';
  execute 'grant execute on function public.pulse_otp_issue(text, text, text) to service_role';
  if to_regprocedure('public.pulse_require_otp_secret(text)') is not null then
    execute 'revoke all on function public.pulse_require_otp_secret(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.pulse_otp_consume(text, text)') is not null then
    execute 'revoke all on function public.pulse_otp_consume(text, text) from public, anon, authenticated';
    execute 'grant execute on function public.pulse_otp_consume(text, text) to service_role';
  end if;
end
$otp_caps$;

do $identity_revoke$
declare
  v_name text;
begin
  foreach v_name in array array[
    'public.pulse_credit(text, text, text, integer, jsonb)',
    'public.pulse_bingo_payload(text, text)',
    'public.pulse_live_payload(text, text)',
    'public.pulse_log_event(text, text, text, text, jsonb)',
    'public.pulse_mark_play_day(text)',
    'public.pulse_streak_length(text)',
    'public.pulse_streak_start(text)',
    'public.pulse_sync_streak(text)',
    'public.pulse_cycle_points(text, text)',
    'public.pulse_direct_enter(text, text, text)'
  ]
  loop
    if to_regprocedure(v_name) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', v_name);
    end if;
  end loop;
end
$identity_revoke$;

do $internal_mutators$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'pulse_award_plenos',
        'pulse_apply_match_event',
        'pulse_assign_game_challenges',
        'pulse_bingo_mark',
        'pulse_close_due_flash',
        'pulse_close_due_live',
        'pulse_evaluate_match_challenges',
        'pulse_live_apply',
        'pulse_lock_due_matches',
        'pulse_match_side_effects',
        'pulse_open_inning_question',
        'pulse_resolve_duels',
        'pulse_resolve_inning_question',
        'pulse_score_match_now',
        'pulse_sim_clear',
        'pulse_sim_finish',
        'pulse_sim_script',
        'pulse_sim_tick',
        'pulse_void_bingo'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
end
$internal_mutators$;

do $close_open_tables$
declare
  v_name text;
begin
  for v_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'pulse\_%' escape '\'
      and c.relrowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', v_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_name);
  end loop;
end
$close_open_tables$;

-- Fase 2. El panel admin del navegador pasa a /api/pulse. Estas revocaciones
-- rompen el cliente viejo del panel, así que no van en la Fase 1.
do $phase2_admin$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (
        p.proname like 'pulse\_admin\_%' escape '\'
        or p.proname like 'pulse\_reporter\_%' escape '\'
        or p.proname like 'pulse\_trivia\_admin\_%' escape '\'
        or p.proname in ('pulse_cleanup_test', 'pulse_seed_test_scenario', 'pulse_require_admin')
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', r.signature);
    end if;
  end loop;
end
$phase2_admin$;

insert into public.pulse_internal_config (key, value)
values ('pin_registration_enabled', 'true'), ('pin_prizes_frozen', 'false')
on conflict (key) do nothing;

create or replace function public.pulse_registration_open()
returns jsonb
language sql
security definer
set search_path to public
as $$
  select case
    when coalesce((select value from public.pulse_internal_config where key = 'pin_registration_enabled'), 'true')
      in ('false', '0', 'no')
    then jsonb_build_object('ok', true, 'open', false, 'code', 'REGISTRATION_CLOSED')
    else jsonb_build_object('ok', true, 'open', true, 'code', 'REGISTRATION_OPEN')
  end;
$$;

create or replace function public.pulse_prizes_frozen()
returns boolean
language sql
security definer
set search_path to public
as $$
  select coalesce((select value from public.pulse_internal_config where key = 'pin_prizes_frozen'), 'false')
    in ('true', '1', 'yes');
$$;

revoke all on function public.pulse_registration_open() from public, anon, authenticated;
revoke all on function public.pulse_prizes_frozen() from public, anon, authenticated;
grant execute on function public.pulse_registration_open() to service_role;
grant execute on function public.pulse_prizes_frozen() to service_role;

alter table public.pulse_transactions
  add column if not exists metadata jsonb;

create unique index if not exists pulse_transactions_source_unique
  on public.pulse_transactions (source_type, source_id);

create or replace function public.pulse_credit(
  p_user text,
  p_source_type text,
  p_source_id text,
  p_points integer,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  if public.pulse_prizes_frozen() then
    return;
  end if;
  if coalesce(p_points, 0) <= 0 then
    delete from public.pulse_transactions
    where source_type = p_source_type and source_id = p_source_id;
    return;
  end if;
  insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
  values (
    'tx_' || md5(p_source_type || ':' || p_source_id),
    p_user,
    'exp_tobo',
    p_source_type,
    p_source_id,
    p_points,
    coalesce(p_meta, '{}'::jsonb)
  )
  on conflict (source_type, source_id) do update
  set points = excluded.points,
      metadata = excluded.metadata
  where public.pulse_transactions.points is distinct from excluded.points
     or public.pulse_transactions.metadata is distinct from excluded.metadata;
end;
$$;

revoke all on function public.pulse_credit(text, text, text, integer, jsonb) from public, anon, authenticated;

do $phase2_league$
begin
  if to_regprocedure('public.pulse_user_id(text)') is null
     or to_regclass('public.pulse_league_members') is null then
    return;
  end if;
  execute $fn$
    create or replace function public.pulse_league_ranking(
      p_token text,
      p_league_id text,
      p_cycle text default 'lifetime'
    )
    returns jsonb
    language plpgsql
    security definer
    set search_path to public
    as $body$
    declare
      uid text;
    begin
      uid := public.pulse_user_id(p_token);
      if uid is null or not exists (
        select 1 from public.pulse_league_members member
        where member.league_id = p_league_id and member.user_id = uid
      ) then
        return '[]'::jsonb;
      end if;
      if public.pulse_prizes_frozen() then
        return '[]'::jsonb;
      end if;
      if to_regprocedure('public.pulse_ranking(text,text,text)') is not null then
        return public.pulse_ranking(p_token, p_cycle, p_league_id);
      end if;
      return jsonb_build_object('member', true);
    end;
    $body$;
  $fn$;
  execute 'revoke all on function public.pulse_league_ranking(text, text, text) from public';
  execute 'grant execute on function public.pulse_league_ranking(text, text, text) to anon, authenticated, service_role';
end
$phase2_league$;

do $phase2_require_admin$
begin
  if to_regclass('public.pulse_admin_keys') is null then
    return;
  end if;
  execute 'drop function if exists public.pulse_require_admin(text)';
  execute $fn$
    create function public.pulse_require_admin(p_admin_key text)
    returns boolean
    language plpgsql
    security definer
    set search_path to public, extensions
    as $body$
    declare
      v_key text;
      v_got text := trim(coalesce(p_admin_key, ''));
      v_a bytea;
      v_b bytea;
      v_diff int := 0;
      v_i int;
    begin
      select admin_key into v_key from public.pulse_admin_keys order by id limit 1;
      if v_key is null or length(v_got) < 32 or length(v_key) < 32 then
        return false;
      end if;
      v_a := extensions.digest(v_got, 'sha256');
      v_b := extensions.digest(v_key, 'sha256');
      for v_i in 0..31 loop
        v_diff := v_diff + (get_byte(v_a, v_i) # get_byte(v_b, v_i));
      end loop;
      return v_diff = 0;
    end;
    $body$;
  $fn$;
  execute 'revoke all on function public.pulse_require_admin(text) from public, anon, authenticated';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.pulse_require_admin(text) to service_role';
  end if;
end
$phase2_require_admin$;
