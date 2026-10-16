-- Bienvenida en el perfil, datos de Garrison y acciones de juegos solo para super admin.
-- Las cuentas que ya existían quedan marcadas como vistas. Las nuevas nacen sin verla.

alter table public.pulse_profiles
  add column if not exists onboarding_visto_at timestamptz;

update public.pulse_profiles
set onboarding_visto_at = now()
where onboarding_visto_at is null;

alter table public.pulse_venues
  add column if not exists category text not null default '',
  add column if not exists maps_url text not null default '',
  add column if not exists rif text not null default '';

create or replace function public.pulse_profile_private(profile_row public.pulse_profiles)
returns jsonb
language sql
stable
as $$
  select public.pulse_public_profile(profile_row)
    || jsonb_build_object(
      'phone', profile_row.phone,
      'city', coalesce(profile_row.city, ''),
      'fullName', coalesce(profile_row.full_name, ''),
      'onboardingVistoAt', profile_row.onboarding_visto_at
    );
$$;

create or replace function public.pulse_mark_onboarding(p_token text)
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
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para continuar.');
  end if;
  update public.pulse_profiles
  set onboarding_visto_at = coalesce(onboarding_visto_at, now())
  where id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.pulse_mark_onboarding(text) from public;
grant execute on function public.pulse_mark_onboarding(text) to anon, authenticated, service_role;

create or replace function public.pulse_whatsapp_digits(raw text)
returns text
language plpgsql
immutable
as $$
declare
  digits text := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
begin
  if digits like '00%' then digits := substring(digits from 3); end if;
  if length(digits) = 11 and digits like '0%' then digits := '58' || substring(digits from 2); end if;
  if length(digits) = 10 and digits like '4%' then digits := '58' || digits; end if;
  if digits ~ '^58\d{10}$' then return digits; end if;
  return '';
end;
$$;

create or replace function public.pulse_instagram_url(raw text)
returns text
language plpgsql
immutable
as $$
declare
  text_value text := trim(coalesce(raw, ''));
  handle text;
begin
  if text_value = '' or text_value = 'Por confirmar' then return ''; end if;
  if text_value ~* '^https?://' then return text_value; end if;
  handle := regexp_replace(text_value, '^@', '');
  handle := regexp_replace(handle, '/$', '');
  if handle = '' then return ''; end if;
  return 'https://instagram.com/' || handle;
end;
$$;

update public.pulse_venues
set name = 'Garrison Barber Society',
    category = 'Barbería',
    instagram = 'https://instagram.com/garrisonoficial_',
    whatsapp = '584241846766',
    address = 'CC Concresa, Nivel Plaza Principal, Local 212',
    zone = 'CC Concresa',
    maps_url = 'https://maps.app.goo.gl/Yn1KDZjimyjojgpTA',
    rif = 'J-50571292-6',
    round_prize = 'Beneficio en tu primera visita',
    prize_detail = 'Escanea el QR en el local en tu primera visita para activar tu beneficio.',
    prize_terms = 'Escanea el QR en el local en tu primera visita para activar tu beneficio.',
    description = 'Barbería aliada de Rusher.',
    sponsor_text = 'Aliado oficial'
where id = 'venue-garrison';

create or replace function public.pulse_venues_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', venue.id,
    'name', venue.name,
    'slug', venue.slug,
    'zone', venue.zone,
    'city', venue.city,
    'address', venue.address,
    'contact', venue.contact,
    'instagram', venue.instagram,
    'whatsapp', venue.whatsapp,
    'mapsUrl', venue.maps_url,
    'category', venue.category,
    'roundPrize', venue.round_prize,
    'prizeDetail', venue.prize_detail,
    'prizeQuantity', venue.prize_quantity,
    'prizeTerms', venue.prize_terms,
    'prizeStarts', venue.prize_starts,
    'prizeEnds', venue.prize_ends,
    'logoUrl', venue.logo_url,
    'imageUrl', venue.image_url,
    'description', venue.description,
    'sponsorText', venue.sponsor_text,
    'broadcasts', venue.broadcasts,
    'isFounder', venue.is_founder,
    'active', venue.active,
    'cycleId', venue.cycle_id,
    'highlights', coalesce(venue.highlights, '[]'::jsonb),
    'lat', venue.lat,
    'lng', venue.lng,
    'gamesAiring', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', match.id, 'awayTeam', match.away_team, 'homeTeam', match.home_team, 'startsAt', match.starts_at
      ) order by match.starts_at)
      from public.pulse_matches match
      where match.id in (select jsonb_array_elements_text(venue.games_airing))
    ), '[]'::jsonb)
  ) order by venue.name), '[]'::jsonb)
  from public.pulse_venues venue
  where venue.active and public.pulse_is_mvp_venue(venue.id, venue.name);
$$;

create or replace function public.pulse_admin_allies(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'venues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'name', v.name,
        'zone', v.zone,
        'city', v.city,
        'active', v.active,
        'category', v.category,
        'address', v.address,
        'instagram', v.instagram,
        'whatsapp', v.whatsapp,
        'mapsUrl', v.maps_url,
        'rif', v.rif,
        'benefit', v.round_prize,
        'logoUrl', v.logo_url,
        'imageUrl', v.image_url,
        'scans', (select count(*) from public.pulse_qr_scans s where s.venue_id = v.id),
        'qrRewards', (
          select count(*) from public.pulse_transactions t
          where t.source_type = 'qr_scan' and t.metadata->>'venueId' = v.id
        )
      ) order by v.name)
      from public.pulse_venues v
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'venueId', c.venue_id,
        'venue', v.name,
        'name', c.name,
        'code', c.code,
        'points', c.points,
        'active', c.active,
        'opens', (select count(*) from public.pulse_campaign_opens o where o.campaign_id = c.id),
        'rewards', (select count(*) from public.pulse_campaign_rewards r where r.campaign_id = c.id),
        'newAccounts', (select count(*) from public.pulse_campaign_rewards r where r.campaign_id = c.id and r.new_account)
      ) order by c.created_at desc)
      from public.pulse_campaigns c
      join public.pulse_venues v on v.id = c.venue_id
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.pulse_admin_save_ally(text, text, text, text, text, boolean);

create or replace function public.pulse_admin_save_ally(
  p_admin_key text,
  p_venue_id text,
  p_name text,
  p_zone text,
  p_city text,
  p_active boolean,
  p_category text default '',
  p_benefit text default '',
  p_instagram text default '',
  p_whatsapp text default '',
  p_address text default '',
  p_maps_url text default '',
  p_rif text default '',
  p_logo_url text default '',
  p_image_url text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  ally_name text := trim(coalesce(p_name, ''));
  venue_id text := nullif(trim(coalesce(p_venue_id, '')), '');
  phone text := public.pulse_whatsapp_digits(p_whatsapp);
  social text := public.pulse_instagram_url(p_instagram);
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if char_length(ally_name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre del local.');
  end if;
  if trim(coalesce(p_whatsapp, '')) <> '' and phone = '' then
    return jsonb_build_object('ok', false, 'error', 'El WhatsApp necesita el código de país, por ejemplo +58 424 000 0000.');
  end if;
  if trim(coalesce(p_maps_url, '')) <> '' and trim(p_maps_url) !~* '^https?://' then
    return jsonb_build_object('ok', false, 'error', 'El enlace de Maps tiene que empezar por https://');
  end if;
  if venue_id is null then
    venue_id := 'venue_' || substr(md5(gen_random_uuid()::text), 1, 16);
    insert into public.pulse_venues (
      id, name, zone, city, active, category, round_prize, instagram, whatsapp, address, maps_url, rif, logo_url, image_url
    ) values (
      venue_id, ally_name, trim(coalesce(p_zone, '')), trim(coalesce(p_city, '')), coalesce(p_active, true),
      trim(coalesce(p_category, '')), trim(coalesce(p_benefit, '')), social, phone, trim(coalesce(p_address, '')),
      trim(coalesce(p_maps_url, '')), trim(coalesce(p_rif, '')), trim(coalesce(p_logo_url, '')), trim(coalesce(p_image_url, ''))
    );
  else
    update public.pulse_venues as venue
    set name = ally_name,
        zone = trim(coalesce(p_zone, venue.zone)),
        city = trim(coalesce(p_city, venue.city)),
        active = coalesce(p_active, venue.active),
        category = trim(coalesce(p_category, '')),
        round_prize = trim(coalesce(p_benefit, '')),
        instagram = social,
        whatsapp = phone,
        address = trim(coalesce(p_address, '')),
        maps_url = trim(coalesce(p_maps_url, '')),
        rif = trim(coalesce(p_rif, '')),
        logo_url = trim(coalesce(p_logo_url, '')),
        image_url = trim(coalesce(p_image_url, ''))
    where venue.id = venue_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Ese local no existe.');
    end if;
  end if;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_save_ally', venue_id, true, jsonb_build_object('name', ally_name, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'id', venue_id);
end;
$$;

create or replace function public.pulse_admin_void_match(p_admin_key text, p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  result jsonb;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  result := public.pulse_admin_cancel(p_admin_key, p_match_id);
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_void_match', trim(coalesce(p_match_id, '')), coalesce(result->>'ok', 'false') = 'true', coalesce(result, '{}'::jsonb));
  return result;
end;
$$;

create or replace function public.pulse_admin_delete_match(p_admin_key text, p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  game public.pulse_matches;
  preds integer := 0;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  select * into game from public.pulse_matches where id = trim(coalesce(p_match_id, '')) for update;
  if game.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  select count(*)::integer into preds from public.pulse_match_predictions where match_id = game.id;
  if preds > 0 or exists (
    select 1 from public.pulse_transactions tx
    join public.pulse_match_predictions pred on pred.id = tx.source_id
    where pred.match_id = game.id and tx.source_type = 'prediction' and tx.points <> 0
  ) then
    return jsonb_build_object('ok', false, 'error', 'Este juego tiene pronósticos. Anúlalo en su lugar.');
  end if;
  delete from public.pulse_matches where id = game.id;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_delete_match', game.id, true, jsonb_build_object('away', game.away_team, 'home', game.home_team, 'startsAt', game.starts_at));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_reschedule_match(p_admin_key text, p_match_id text, p_starts_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  game public.pulse_matches;
begin
  actor := public.pulse_admin_require_super(p_admin_key);
  if p_starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'Elige la nueva fecha y hora.');
  end if;
  select * into game from public.pulse_matches where id = trim(coalesce(p_match_id, '')) for update;
  if game.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if game.starts_at <= now() or game.status in ('finished', 'cancelled', 'locked', 'in_progress') then
    return jsonb_build_object('ok', false, 'error', 'Solo se reprograma un juego que aún no empieza.');
  end if;
  update public.pulse_matches set starts_at = p_starts_at where id = game.id;
  insert into public.pulse_admin_audit (user_id, action, target, ok, details)
  values (actor, 'pulse_admin_reschedule_match', game.id, true, jsonb_build_object('from', game.starts_at, 'to', p_starts_at));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.pulse_admin_save_ally(text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_void_match(text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_delete_match(text, text) from public, anon, authenticated;
revoke all on function public.pulse_admin_reschedule_match(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.pulse_admin_save_ally(text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.pulse_admin_void_match(text, text) to service_role;
grant execute on function public.pulse_admin_delete_match(text, text) to service_role;
grant execute on function public.pulse_admin_reschedule_match(text, text, timestamptz) to service_role;
