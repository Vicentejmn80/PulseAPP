-- RUSHER — Registro solo con contraseña (sin PIN).
--
-- pulse_account_register_password_only(p_phone, p_full_name, p_alias, p_password):
--  - Mismas validaciones que el registro con PIN, menos el PIN:
--    teléfono, nombre, contraseña (pulse_password_valid), alias.
--  - PIN nunca pedido ni guardado: pin_hash queda NULL, auth_method='password'.
--  - Mismos códigos anti-enumeración (REGISTER_REJECTED) y manejo de
--    unique_violation por carrera que el resto de registros.
--  - Solo service_role (se llama vía /api/pulse, nunca directo del cliente).
--  - No toca login: la rama de contraseña de pulse_account_login_password ya
--    acepta cuentas con pin_hash NULL (v_match exige password_hash, no PIN).

create or replace function public.pulse_account_register_password_only(
  p_phone text,
  p_full_name text,
  p_alias text,
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

  if not public.pulse_password_valid(p_password) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PASSWORD', 'error', 'La contraseña necesita 8+ caracteres, 1 mayúscula, 1 número y 1 símbolo.');
  end if;

  v_alias := trim(coalesce(p_alias, ''));
  v_key := public.pulse_alias_key(v_alias);
  if v_key !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ALIAS', 'error', 'Usa de 3 a 20 letras, números o _. Sin espacios.');
  end if;

  if exists (select 1 from public.pulse_profiles pr where pr.phone = v_phone) then
    perform public.pulse_auth_note('password_only_register', 'PHONE_TAKEN', v_phone);
    return jsonb_build_object('ok', false, 'code', 'REGISTER_REJECTED', 'error', 'No pudimos crear la cuenta. Revisa los datos o entra con tu contraseña.');
  end if;
  if exists (select 1 from public.pulse_profiles pr where pr.alias_normalized = v_key) then
    perform public.pulse_auth_note('password_only_register', 'ALIAS_TAKEN', v_phone);
    return jsonb_build_object('ok', false, 'code', 'REGISTER_REJECTED', 'error', 'No pudimos crear la cuenta. Revisa los datos o entra con tu contraseña.');
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
  profile.pin_hash := null;
  profile.password_hash := extensions.crypt(p_password, extensions.gen_salt('bf', v_cost));
  profile.auth_method := 'password';
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
        perform public.pulse_auth_note('password_only_register', 'PHONE_TAKEN', v_phone);
      else
        perform public.pulse_auth_note('password_only_register', 'ALIAS_TAKEN', v_phone);
      end if;
      return jsonb_build_object('ok', false, 'code', 'REGISTER_REJECTED', 'error', 'No pudimos crear la cuenta. Revisa los datos o entra con tu contraseña.');
  end;

  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id, expires_at)
  values (token, profile.id, now() + interval '30 days');
  return public.pulse_snapshot(profile.id, token)
    || jsonb_build_object('isNew', true, 'code', 'PROFILE_CREATED');
end;
$$;

revoke all on function public.pulse_account_register_password_only(text, text, text, text) from public, anon, authenticated;
grant execute on function public.pulse_account_register_password_only(text, text, text, text) to service_role;
