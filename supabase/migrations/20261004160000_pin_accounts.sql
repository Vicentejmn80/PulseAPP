-- PIN accounts on the existing pulse_profiles / pulse_sessions model.
-- Duplicate check run before the unique index: 0 groups of the same normalized phone
-- (2 profiles, 2 distinct phones). No rows deleted.

alter table public.pulse_profiles
  add column if not exists pin_hash text;

create unique index if not exists pulse_profiles_phone_normalized_uidx
  on public.pulse_profiles ((public.pulse_normalize_phone(phone)))
  where public.pulse_normalize_phone(phone) <> '';

create or replace function public.pulse_profile_private(profile_row public.pulse_profiles)
returns jsonb
language sql
immutable
as $$
  select public.pulse_public_profile(profile_row)
    || jsonb_build_object(
      'phone', profile_row.phone,
      'city', coalesce(profile_row.city, ''),
      'fullName', coalesce(profile_row.full_name, '')
    );
$$;

create or replace function public.pulse_pin_valid(p_pin text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_pin, '') ~ '^\d{6}$'
    and p_pin not in (
      '000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
      '123456','654321','121212'
    );
$$;

create or replace function public.pulse_account_register(
  p_phone text,
  p_full_name text,
  p_alias text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_phone text;
  v_full text;
  v_alias text;
  v_key text;
  v_constraint text;
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
    return jsonb_build_object('ok', false, 'code', 'PHONE_ALREADY_REGISTERED', 'error', 'Este número ya tiene una cuenta. Inicia sesión.');
  end if;
  if exists (select 1 from public.pulse_profiles pr where pr.alias_normalized = v_key) then
    return jsonb_build_object('ok', false, 'code', 'ALIAS_ALREADY_TAKEN', 'error', 'Este alias ya está ocupado.');
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
  profile.pin_hash := crypt(p_pin, gen_salt('bf'));

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
      get stacked diagnostics v_constraint = CONSTRAINT_NAME;
      if v_constraint in ('pulse_profiles_phone_key', 'pulse_profiles_phone_normalized_uidx') then
        return jsonb_build_object('ok', false, 'code', 'PHONE_ALREADY_REGISTERED', 'error', 'Este número ya tiene una cuenta. Inicia sesión.');
      end if;
      return jsonb_build_object('ok', false, 'code', 'ALIAS_ALREADY_TAKEN', 'error', 'Este alias ya está ocupado.');
  end;

  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id) values (token, profile.id);
  return public.pulse_snapshot(profile.id, token)
    || jsonb_build_object('isNew', true, 'code', 'PROFILE_CREATED');
end;
$$;

create or replace function public.pulse_account_login(p_phone text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_phone text;
  profile public.pulse_profiles;
  token text;
begin
  v_phone := public.pulse_normalize_phone(p_phone);
  if v_phone = '' or coalesce(p_pin, '') !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'code', 'PIN_INVALID', 'error', 'El número o PIN no son correctos.');
  end if;

  select * into profile from public.pulse_profiles pr where pr.phone = v_phone;
  if profile.id is null then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_NOT_FOUND', 'error', 'No encontramos una cuenta con este número.');
  end if;
  if profile.pin_hash is null or crypt(p_pin, profile.pin_hash) is distinct from profile.pin_hash then
    return jsonb_build_object('ok', false, 'code', 'PIN_INVALID', 'error', 'El número o PIN no son correctos.');
  end if;

  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id) values (token, profile.id);
  return public.pulse_snapshot(profile.id, token)
    || jsonb_build_object('isNew', false, 'code', 'SESSION_CREATED');
end;
$$;

create or replace function public.pulse_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.pulse_sessions where token = trim(coalesce(p_token, ''));
  return jsonb_build_object('ok', true, 'code', 'LOGGED_OUT');
end;
$$;

create or replace function public.pulse_direct_enter(p_phone text, p_full_name text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return jsonb_build_object(
    'ok', false,
    'code', 'DIRECT_ENTER_DISABLED',
    'error', 'Crea tu cuenta con nombre, alias, teléfono y PIN.'
  );
end;
$$;

grant execute on function public.pulse_account_register(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_account_login(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_logout(text) to anon, authenticated, service_role;
grant execute on function public.pulse_pin_valid(text) to anon, authenticated, service_role;
