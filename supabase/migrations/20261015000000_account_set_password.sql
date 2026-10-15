-- RUSHER — Fijar/cambiar contraseña de una cuenta existente.
--
-- pulse_account_set_password(p_token, p_current, p_new_password):
--  - Exige sesión válida (p_token → user_id). Sin sesión → SESSION_EXPIRED.
--  - Verifica la credencial actual contra pin_hash O password_hash (bcrypt).
--    Si no coincide con ninguna → AUTH_INVALID genérico (sin oráculo).
--  - Valida la nueva con pulse_password_valid → INVALID_PASSWORD.
--  - Guarda bcrypt + password_set_at; auth_method pasa a 'both' si hay PIN,
--    o 'password' si no lo hay. Nunca crea un segundo perfil.
--  - Reutiliza el throttle de pulse_pin_attempts con la misma política
--    del login (5 fallos → 15min/1h/24h).
--  - Solo service_role (se llama vía /api/pulse, nunca directo del cliente).

create or replace function public.pulse_account_set_password(
  p_token text,
  p_current text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_user_id text;
  v_phone text;
  v_hmac text;
  v_cost integer;
  v_dummy text;
  v_pin_hash text;
  v_password_hash text;
  v_current text := coalesce(p_current, '');
  v_new text := coalesce(p_new_password, '');
  v_check_pin text;
  v_check_password text;
  v_match boolean := false;
  attempt public.pulse_pin_attempts;
  v_lock_start timestamptz;
  v_new_level integer := 0;
  v_step interval := interval '15 minutes';
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'error', 'La sesión expiró. Entra de nuevo.');
  end if;

  select phone, pin_hash, password_hash
    into v_phone, v_pin_hash, v_password_hash
  from public.pulse_profiles
  where id = v_user_id;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'error', 'La sesión expiró. Entra de nuevo.');
  end if;

  if not public.pulse_password_valid(v_new) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PASSWORD', 'error', 'La contraseña necesita 8+ caracteres, 1 mayúscula, 1 número y 1 símbolo.');
  end if;

  select value into v_dummy from public.pulse_internal_config where key = 'pin_dummy_hash';
  select value::integer into v_cost from public.pulse_internal_config where key = 'pin_bcrypt_cost';
  if v_cost is null or v_cost < 4 or v_cost > 12 then
    v_cost := 10;
  end if;
  if coalesce(v_dummy, '') = '' then
    v_dummy := extensions.crypt(encode(extensions.gen_random_bytes(16), 'hex'), extensions.gen_salt('bf', v_cost));
  end if;

  -- La credencial actual puede ser el PIN o la contraseña vigente.
  v_check_pin := extensions.crypt(v_current, coalesce(v_pin_hash, v_dummy));
  v_check_password := extensions.crypt(v_current, coalesce(v_password_hash, v_dummy));
  perform extensions.crypt(v_current, v_dummy);
  v_match := (v_pin_hash is not null and v_check_pin is not distinct from v_pin_hash)
    or (v_password_hash is not null and v_check_password is not distinct from v_password_hash);

  v_hmac := public.pulse_phone_hmac(v_phone);
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

  if attempt.next_allowed_at > now() then
    perform public.pulse_auth_note('password_set', 'THROTTLED', v_phone);
    return jsonb_build_object(
      'ok', false,
      'code', 'PIN_RATE_LIMITED',
      'error', 'Demasiados intentos. Espera unos minutos.',
      'retryAfter', ceil(extract(epoch from (attempt.next_allowed_at - now())))::integer
    );
  end if;

  if not v_match then
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
    perform public.pulse_auth_note('password_set', 'CURRENT_MISMATCH', v_phone);
    return jsonb_build_object('ok', false, 'code', 'AUTH_INVALID', 'error', 'No pudimos validar tus credenciales.');
  end if;

  update public.pulse_profiles
  set password_hash = extensions.crypt(v_new, extensions.gen_salt('bf', v_cost)),
      password_set_at = now(),
      auth_method = case when pin_hash is not null then 'both' else 'password' end
  where id = v_user_id;

  update public.pulse_pin_attempts
  set failures = 0,
      window_started_at = now(),
      next_allowed_at = now(),
      lock_level = 0,
      lock_raised_at = null,
      updated_at = now()
  where phone_hmac = v_hmac;

  perform public.pulse_auth_note('password_set', 'OK', v_phone);
  return jsonb_build_object('ok', true, 'code', 'PASSWORD_SET');
end;
$$;

revoke all on function public.pulse_account_set_password(text, text, text) from public, anon, authenticated;
grant execute on function public.pulse_account_set_password(text, text, text) to service_role;
