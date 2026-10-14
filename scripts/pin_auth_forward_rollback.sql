-- Forward rollback. Do not apply unless you are undoing the hardening.
-- Restores the previous PIN login and load bodies.
-- Does not restore pulse_register, pulse_login, or pulse_otp_finish.
-- Does not grant anon execute on pulse_snapshot or pulse_profile_private.
-- Leaves expires_at in place. Inserts that omit it use the column default.

create or replace function public.pulse_account_login(p_phone text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $fn$
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
  if profile.pin_hash is null or extensions.crypt(p_pin, profile.pin_hash) is distinct from profile.pin_hash then
    return jsonb_build_object('ok', false, 'code', 'PIN_INVALID', 'error', 'El número o PIN no son correctos.');
  end if;
  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id, expires_at)
  values (token, profile.id, now() + interval '30 days');
  return public.pulse_snapshot(profile.id, token)
    || jsonb_build_object('isNew', false, 'code', 'SESSION_CREATED');
end;
$fn$;

create or replace function public.pulse_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $fn$
declare
  session_row public.pulse_sessions;
begin
  select * into session_row from public.pulse_sessions where token = p_token;
  if session_row.token is null or session_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'La sesión expiró. Entra de nuevo.');
  end if;
  return public.pulse_snapshot(session_row.user_id, session_row.token);
end;
$fn$;

revoke all on function public.pulse_account_login(text, text) from public;
revoke all on function public.pulse_load(text) from public;
grant execute on function public.pulse_account_login(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_load(text) to anon, authenticated, service_role;
