-- La variable source_type de pulse_reto_post chocaba con la columna
-- pulse_transactions.source_type. Ahora se llama v_source_type.
-- La introducción de retos se marca una vez en el perfil.

alter table public.pulse_profiles
  add column if not exists retos_intro_seen_at timestamptz;

create or replace function public.pulse_reto_post(
  p_reto text,
  p_user text,
  p_action text,
  p_points integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := 'reto_' || p_action;
  v_source_id text := p_reto || ':' || p_user || ':' || p_action;
begin
  insert into public.pulse_transactions as tx (id, user_id, experience_id, source_type, source_id, points, metadata)
  values (
    'tx_' || substr(md5(v_source_type || ':' || v_source_id), 1, 24),
    p_user,
    'exp_tobo',
    v_source_type,
    v_source_id,
    p_points,
    jsonb_build_object(
      'retoId', p_reto,
      'earnedOn', (now() at time zone 'America/Caracas')::date,
      'countsForRoundPrize', false
    )
  )
  on conflict (source_type, source_id) do nothing;

  insert into public.pulse_reto_audit (reto_id, user_id, action, points)
  values (p_reto, p_user, p_action, p_points);
exception
  when others then
    raise log 'reto_post % %', sqlstate, sqlerrm;
    raise;
end;
$$;

revoke all on function public.pulse_reto_post(text, text, text, integer) from public, anon, authenticated;

create or replace function public.pulse_reto_prefs(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.', 'adultConfirmed', false, 'introSeen', false, 'recent', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'adultConfirmed', exists (select 1 from public.pulse_profiles profile where profile.id = uid and profile.adult_confirmed_at is not null),
    'introSeen', exists (select 1 from public.pulse_profiles profile where profile.id = uid and profile.retos_intro_seen_at is not null),
    'recent', coalesce((
      select jsonb_agg(name order by name)
      from (
        select distinct rival.alias as name
        from public.pulse_retos reto
        join public.pulse_profiles rival
          on rival.id = case when reto.challenger_id = uid then reto.opponent_id else reto.challenger_id end
        where reto.challenger_id = uid or reto.opponent_id = uid
        order by rival.alias
        limit 6
      ) found
    ), '[]'::jsonb)
  );
exception
  when others then
    raise log 'reto_prefs % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error', 'No pudimos cargar los retos. Inténtalo de nuevo.');
end;
$$;

create or replace function public.pulse_reto_intro_ack(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  update public.pulse_profiles profile
  set retos_intro_seen_at = coalesce(profile.retos_intro_seen_at, now())
  where profile.id = uid;
  return jsonb_build_object('ok', true);
exception
  when others then
    raise log 'reto_intro % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error', 'No pudimos guardar. Inténtalo de nuevo.');
end;
$$;

grant execute on function public.pulse_reto_prefs(text) to anon, authenticated;
grant execute on function public.pulse_reto_intro_ack(text) to anon, authenticated;
