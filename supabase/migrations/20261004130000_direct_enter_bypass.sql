-- Direct enter (bypass WhatsApp OTP) while ENABLE_WHATSAPP_OTP is false on the API.

alter table public.pulse_profiles
  add column if not exists full_name text not null default '';

create or replace function public.pulse_profile_private(profile_row public.pulse_profiles)
returns jsonb
language sql
immutable
as $$
  select public.pulse_public_profile(profile_row)
    || jsonb_build_object(
      'phone', profile_row.phone,
      'accessCode', profile_row.access_code,
      'city', coalesce(profile_row.city, ''),
      'fullName', coalesce(profile_row.full_name, '')
    );
$$;

create or replace function public.pulse_direct_enter(p_phone text, p_full_name text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone text;
  v_full text;
  v_alias text;
  v_key text;
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

  select * into profile from public.pulse_profiles pr where pr.phone = v_phone;

  if profile.id is not null then
    update public.pulse_profiles
    set full_name = v_full
    where id = profile.id;

    token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.pulse_sessions (token, user_id) values (token, profile.id);
    return public.pulse_snapshot(profile.id, token)
      || jsonb_build_object('isNew', false, 'code', 'SESSION_CREATED');
  end if;

  v_alias := trim(coalesce(p_alias, ''));
  v_key := public.pulse_alias_key(v_alias);
  if v_key !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ALIAS', 'error', 'Usa de 3 a 20 letras, números o _. Sin espacios.');
  end if;
  if exists (select 1 from public.pulse_profiles pr where pr.alias_normalized = v_key) then
    return jsonb_build_object('ok', false, 'code', 'ALIAS_ALREADY_TAKEN', 'error', 'Ese alias ya está ocupado.');
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

  begin
    insert into public.pulse_profiles (
      id, phone, alias, handle, initials, avatar_color, access_code, city, alias_normalized, full_name
    )
    values (
      profile.id, profile.phone, profile.alias, profile.handle, profile.initials,
      profile.avatar_color, profile.access_code, profile.city, profile.alias_normalized, profile.full_name
    );
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'ALIAS_ALREADY_TAKEN', 'error', 'Ese alias ya está ocupado.');
  end;

  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id) values (token, profile.id);
  return public.pulse_snapshot(profile.id, token)
    || jsonb_build_object('isNew', true, 'code', 'PROFILE_CREATED');
end;
$$;

grant execute on function public.pulse_direct_enter(text, text, text) to anon, authenticated, service_role;
