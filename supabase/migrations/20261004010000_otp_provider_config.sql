-- Lets the serverless auth route read Twilio settings from pulse_internal_config
-- when Vercel env vars are missing. Values themselves stay in the database.

create or replace function public.pulse_otp_provider(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid text;
  v_token text;
  v_from text;
  v_content text;
begin
  perform public.pulse_require_otp_secret(p_secret);
  select value into v_sid from public.pulse_internal_config where key = 'twilio_account_sid';
  select value into v_token from public.pulse_internal_config where key = 'twilio_auth_token';
  select value into v_from from public.pulse_internal_config where key = 'twilio_whatsapp_number';
  select value into v_content from public.pulse_internal_config where key = 'twilio_content_sid';
  if coalesce(v_sid, '') = '' or coalesce(v_token, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Twilio no está configurado.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'accountSid', v_sid,
    'authToken', v_token,
    'whatsappNumber', coalesce(nullif(v_from, ''), '+17372508034'),
    'contentSid', coalesce(v_content, '')
  );
end;
$$;

grant execute on function public.pulse_otp_provider(text) to anon, authenticated;
