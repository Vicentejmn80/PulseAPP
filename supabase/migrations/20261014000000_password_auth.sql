-- RUSHER — Auth con contraseña (Bloque 1).
--
-- 1. Columnas nuevas en pulse_profiles: password_hash (bcrypt), auth_method,
--    password_set_at. Usuarios existentes quedan en auth_method='pin'.
-- 2. pulse_password_valid: regla de formato (8+, mayúscula, número, símbolo).
-- 3. pulse_account_register_password: registro PIN + contraseña (auth_method='both').
-- 4. pulse_account_login_password: login por PIN, contraseña o auto-detección.
-- 5. Overload pulse_account_login(text,text,text) que delega en la anterior.
-- 6. Unificación anti-enumeración: el login de 2 args ahora devuelve AUTH_INVALID
--    ("No pudimos validar tus credenciales.") en todos los fallos de credencial.
--    PIN_RATE_LIMITED se mantiene intacto (lleva retryAfter y es preexistente).
-- 7. Grants idénticos a los vigentes: solo service_role (revocado a
--    public/anon/authenticated). CREATE OR REPLACE conserva los grants
--    existentes de la firma de 2 args.
--
-- No se toca: pulse_pin_commit (solo escribe pin_hash; auth_method se conserva),
-- triggers (no hay ninguno en pulse_profiles), pulse_sessions, trivia/QR/ranking.

-- ── 1. Columnas ─────────────────────────────────────────────────────────────
alter table public.pulse_profiles
  add column if not exists password_hash text,
  add column if not exists auth_method text not null default 'pin',
  add column if not exists password_set_at timestamptz;

alter table public.pulse_profiles
  drop constraint if exists pulse_profiles_auth_method_check;

alter table public.pulse_profiles
  add constraint pulse_profiles_auth_method_check
  check (auth_method in ('pin', 'password', 'both'));

-- ── 2. Validador de formato de contraseña ───────────────────────────────────
-- Clases POSIX para no romper con Ñ/tildes según collation. El servidor manda;
-- el cliente solo replica esta regla para feedback instantáneo.
create or replace function public.pulse_password_valid(p_password text)
returns boolean
language sql
immutable
as $$
  select length(coalesce(p_password, '')) >= 8
    and p_password ~ '[[:upper:]]'
    and p_password ~ '[[:digit:]]'
    and p_password ~ '[^[:alnum:]]';
$$;

-- ── 3. Registro con PIN + contraseña ────────────────────────────────────────
create or replace function public.pulse_account_register_password(
  p_phone text,
  p_full_name text,
  p_alias text,
  p_pin text,
  p_password text
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

  if not public.pulse_password_valid(p_password) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PASSWORD', 'error', 'La contraseña necesita 8+ caracteres, 1 mayúscula, 1 número y 1 símbolo.');
  end if;

  v_alias := trim(coalesce(p_alias, ''));
  v_key := public.pulse_alias_key(v_alias);
  if v_key !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ALIAS', 'error', 'Usa de 3 a 20 letras, números o _. Sin espacios.');
  end if;

  if exists (select 1 from public.pulse_profiles pr where pr.phone = v_phone) then
    perform public.pulse_auth_note('password_register', 'PHONE_TAKEN', v_phone);
    return jsonb_build_object('ok', false, 'code', 'REGISTER_REJECTED', 'error', 'No pudimos crear la cuenta. Revisa los datos o entra con tu PIN.');
  end if;
  if exists (select 1 from public.pulse_profiles pr where pr.alias_normalized = v_key) then
    perform public.pulse_auth_note('password_register', 'ALIAS_TAKEN', v_phone);
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
  profile.password_hash := extensions.crypt(p_password, extensions.gen_salt('bf', v_cost));
  profile.auth_method := 'both';
  profile.password_set_at := now();

  begin
    insert into public.pulse_profiles (
      id, phone, alias, handle, initials, avatar_color, access_code, city, alias_normalized, full_name,
      pin_hash, password_hash, auth_method, password_set_at
    )
    values (
      profile.id, profile.phone, profile.alias, profile.handle, profile.initials,
      profile.avatar_color, profile.access_code, profile.city, profile.alias_normalized, profile.full_name,
      profile.pin_hash, profile.password_hash, profile.auth_method, profile.password_set_at
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('pulse_profiles_phone_key', 'pulse_profiles_phone_normalized_uidx') then
        perform public.pulse_auth_note('password_register', 'PHONE_TAKEN', v_phone);
      else
        perform public.pulse_auth_note('password_register', 'ALIAS_TAKEN', v_phone);
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

-- ── 4. Login por PIN, contraseña o auto-detección ───────────────────────────
-- Anti-enumeración: TODO fallo de credencial devuelve el mismo código y texto
-- (AUTH_INVALID). No existe PASSWORD_NOT_SET en ningún camino, ni siquiera
-- como reason interno: cuenta-sin-contraseña se registra como PASSWORD_MISMATCH.
create or replace function public.pulse_account_login_password(
  p_phone text,
  p_credential text,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_phone text;
  v_method text := lower(trim(coalesce(p_method, 'auto')));
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
  v_reason text := 'PASSWORD_MISMATCH';
  v_check text;
  v_lock_start timestamptz;
  v_pad text;
  v_new_level integer := 0;
  v_step interval := interval '15 minutes';
begin
  if v_method not in ('pin', 'password', 'auto') then
    return jsonb_build_object('ok', false, 'code', 'AUTH_INVALID', 'error', 'No pudimos validar tus credenciales.');
  end if;

  -- Rama PIN: delega en el login clásico (throttle y mensajes incluidos).
  if v_method = 'pin' or (v_method = 'auto' and coalesce(p_credential, '') ~ '^\d{6}$') then
    return public.pulse_account_login(p_phone, p_credential);
  end if;

  select value into v_dummy from public.pulse_internal_config where key = 'pin_dummy_hash';
  select value::integer into v_cost from public.pulse_internal_config where key = 'pin_bcrypt_cost';
  if v_cost is null or v_cost < 4 or v_cost > 12 then
    v_cost := 10;
  end if;
  if coalesce(v_dummy, '') = '' then
    v_dummy := extensions.crypt(encode(extensions.gen_random_bytes(16), 'hex'), extensions.gen_salt('bf', v_cost));
  end if;

  v_phone := public.pulse_normalize_phone(p_phone);
  if v_phone = '' or coalesce(p_credential, '') = '' then
    perform extensions.crypt(coalesce(p_credential, '0'), v_dummy);
    perform extensions.crypt(coalesce(p_credential, '0'), v_dummy);
    perform public.pulse_auth_note('password_login', 'MALFORMED', null);
    return jsonb_build_object('ok', false, 'code', 'AUTH_INVALID', 'error', 'No pudimos validar tus credenciales.');
  end if;

  v_hmac := public.pulse_phone_hmac(v_phone);
  select pr.id, pr.password_hash into v_profile_id, v_stored
  from public.pulse_profiles pr
  where pr.phone = v_phone;

  v_check := extensions.crypt(p_credential, coalesce(v_stored, v_dummy));
  v_pad := extensions.crypt(p_credential, v_dummy);
  v_stored_cost := substring(v_stored from '^\$2[aby]\$([0-9]{2})\$')::integer;
  if v_stored_cost is not null and v_stored_cost < v_cost then
    v_rehash := extensions.crypt(p_credential, extensions.gen_salt('bf', v_cost));
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
    select password_hash into v_seen from public.pulse_profiles where id = v_profile_id;
    if v_seen is not distinct from v_stored then
      if v_rehash is not null then
        update public.pulse_profiles
        set password_hash = v_rehash,
            password_set_at = coalesce(password_set_at, now())
        where id = v_profile_id
          and password_hash = v_stored;
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

      perform public.pulse_auth_note('password_login', 'OK', v_phone);
      perform public.pulse_auth_note('password_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
      return public.pulse_snapshot(v_profile_id, token)
        || jsonb_build_object('isNew', false, 'code', 'SESSION_CREATED');
    end if;
  end if;

  if v_profile_id is null then
    v_reason := 'NO_ACCOUNT';
  else
    v_reason := 'PASSWORD_MISMATCH';
  end if;

  if attempt.next_allowed_at > now() then
    perform public.pulse_auth_note('password_login', 'THROTTLED', v_phone);
    perform public.pulse_auth_note('password_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
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
    perform public.pulse_auth_note('password_lock_level', v_new_level::text, v_phone);
  end if;

  perform public.pulse_auth_note('password_login', v_reason, v_phone);
  perform public.pulse_auth_note('password_lock_held', round(extract(epoch from (clock_timestamp() - v_lock_start)) * 1000)::text, v_phone);
  return jsonb_build_object('ok', false, 'code', 'AUTH_INVALID', 'error', 'No pudimos validar tus credenciales.');
end;
$$;

-- ── 5. Overload del login clásico: acepta credencial + método, misma lógica ──
create or replace function public.pulse_account_login(p_phone text, p_credential text, p_method text)
returns jsonb
language sql
security definer
set search_path to public, extensions
as $$
  select public.pulse_account_login_password(p_phone, p_credential, p_method);
$$;

-- ── 6. Unificación anti-enumeración en el login clásico de 2 args ────────────
-- Copia exacta de 20261011120000_pin_auth_hardening.sql (líneas 243-413) salvo
-- los dos returns de fallo de credencial, que ahora son AUTH_INVALID.
-- Todo lo demás (throttle, rehash, auditoría, sesión) queda idéntico.
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
    return jsonb_build_object('ok', false, 'code', 'AUTH_INVALID', 'error', 'No pudimos validar tus credenciales.');
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
  return jsonb_build_object('ok', false, 'code', 'AUTH_INVALID', 'error', 'No pudimos validar tus credenciales.');
end;
$$;

-- ── 7. Grants: mismo patrón vigente (solo service_role) ─────────────────────
-- La firma de 2 args conserva sus grants (CREATE OR REPLACE los preserva).
revoke all on function public.pulse_account_register_password(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_account_login_password(text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_account_login(text, text, text) from public, anon, authenticated;
grant execute on function public.pulse_account_register_password(text, text, text, text, text) to service_role;
grant execute on function public.pulse_account_login_password(text, text, text) to service_role;
grant execute on function public.pulse_account_login(text, text, text) to service_role;
