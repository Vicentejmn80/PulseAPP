-- Local-only reconstruction of the auth objects read from the remote catalog.
-- Not a migration. Do not apply to the remote project.

alter table public.pulse_profiles
  add column if not exists prize_eligible boolean not null default true;

alter table public.pulse_transactions
  add column if not exists metadata jsonb;

create table if not exists public.pulse_otp_challenges (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  send_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.pulse_require_otp_secret(p_secret text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_secret, '') = '' then
    raise exception 'otp secret required';
  end if;
end;
$$;

create table if not exists public.pulse_otp_tickets (
  ticket text primary key,
  phone text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.pulse_otp_consume(p_phone text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $function$
declare
  v_phone text;
  v_row public.pulse_otp_challenges;
  v_ticket text;
  v_profile public.pulse_profiles;
  v_token text;
begin
  v_phone := public.pulse_normalize_phone(p_phone);
  if v_phone = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PHONE', 'error', 'Revisa el número de teléfono.');
  end if;
  if p_code !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'code', 'OTP_INVALID', 'error', 'El código debe tener 6 dígitos.');
  end if;

  select * into v_row from public.pulse_otp_challenges where phone = v_phone;
  if v_row.phone is null then
    return jsonb_build_object('ok', false, 'code', 'OTP_INVALID', 'error', 'Pide un código primero.');
  end if;
  if v_row.expires_at < now() then
    delete from public.pulse_otp_challenges where phone = v_phone;
    return jsonb_build_object('ok', false, 'code', 'OTP_EXPIRED', 'error', 'El código expiró. Pide uno nuevo.');
  end if;
  if v_row.attempts >= 5 then
    return jsonb_build_object('ok', false, 'code', 'OTP_RATE_LIMITED', 'error', 'Demasiados intentos. Pide un código nuevo.');
  end if;
  if crypt(p_code, v_row.code_hash) <> v_row.code_hash then
    update public.pulse_otp_challenges set attempts = attempts + 1 where phone = v_phone;
    return jsonb_build_object('ok', false, 'code', 'OTP_INVALID', 'error', 'Código incorrecto.');
  end if;

  delete from public.pulse_otp_challenges where phone = v_phone;
  select * into v_profile from public.pulse_profiles pr where pr.phone = v_phone;

  if v_profile.id is not null then
    v_token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.pulse_sessions (token, user_id) values (v_token, v_profile.id);
    return public.pulse_snapshot(v_profile.id, v_token) || jsonb_build_object('isNew', false, 'code', 'OTP_VERIFIED');
  end if;

  v_ticket := 'otk_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_otp_tickets (ticket, phone, expires_at)
  values (v_ticket, v_phone, now() + interval '20 minutes');
  return jsonb_build_object('ok', true, 'code', 'PHONE_VERIFIED', 'isNew', true, 'ticket', v_ticket, 'phone', v_phone);
end;
$function$;
