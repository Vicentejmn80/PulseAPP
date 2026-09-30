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
    'gamesAiring', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', match.id,
        'awayTeam', match.away_team,
        'homeTeam', match.home_team,
        'startsAt', match.starts_at
      ) order by match.starts_at)
      from public.pulse_matches match
      where match.id in (
        select jsonb_array_elements_text(venue.games_airing)
      )
    ), '[]'::jsonb)
  ) order by venue.is_founder desc, venue.name), '[]'::jsonb)
  from public.pulse_venues venue
  where venue.active;
$$;

create or replace function public.pulse_admin_venues(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', venue.id,
      'name', venue.name,
      'slug', venue.slug,
      'zone', venue.zone,
      'city', venue.city,
      'address', venue.address,
      'contact', venue.contact,
      'instagram', venue.instagram,
      'whatsapp', venue.whatsapp,
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
      'qrToken', venue.qr_token,
      'scanCount', (select count(*) from public.pulse_qr_scans scan where scan.venue_id = venue.id)
    ) order by venue.name)
    from public.pulse_venues venue
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_venue_by_slug(p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  venue public.pulse_venues;
begin
  select * into venue from public.pulse_venues where slug = trim(coalesce(p_slug, '')) and active;
  if venue.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa tasca no está activa.');
  end if;
  perform public.pulse_log_event('venue_viewed', null, venue.id, 'venue_view:' || venue.id || ':' || current_date::text, '{}'::jsonb);
  perform public.pulse_log_event('prize_viewed', null, venue.id, 'prize_view:' || venue.id || ':' || current_date::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'venue', jsonb_build_object(
    'id', venue.id,
    'name', venue.name,
    'slug', venue.slug,
    'zone', venue.zone,
    'city', venue.city,
    'address', venue.address,
    'contact', venue.contact,
    'description', venue.description,
    'sponsorText', venue.sponsor_text,
    'roundPrize', venue.round_prize,
    'prizeDetail', venue.prize_detail,
    'prizeQuantity', venue.prize_quantity,
    'prizeTerms', venue.prize_terms,
    'logoUrl', venue.logo_url,
    'imageUrl', venue.image_url,
    'active', venue.active
  ));
end;
$$;

create or replace function public.pulse_venue_scan(p_token text, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  venue public.pulse_venues;
  visit jsonb;
begin
  select * into venue from public.pulse_venues where slug = trim(coalesce(p_slug, '')) and active;
  if venue.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa tasca no está activa.');
  end if;
  perform public.pulse_log_event('venue_qr_scanned', public.pulse_user_id(p_token), venue.id, 'venue_scan:' || venue.id || ':' || coalesce(public.pulse_user_id(p_token), 'anon') || ':' || current_date::text, '{}'::jsonb);
  perform public.pulse_log_event('venue_qr_viewed', public.pulse_user_id(p_token), venue.id, 'venue_qr:' || venue.id || ':' || coalesce(public.pulse_user_id(p_token), 'anon') || ':' || current_date::text, '{}'::jsonb);
  visit := public.pulse_qr_visit(p_token, venue.qr_token);
  visit := visit || jsonb_build_object('venue', jsonb_build_object(
    'id', venue.id,
    'name', venue.name,
    'slug', venue.slug,
    'zone', venue.zone,
    'city', venue.city,
    'address', venue.address,
    'contact', venue.contact,
    'description', venue.description,
    'sponsorText', venue.sponsor_text,
    'roundPrize', venue.round_prize,
    'prizeDetail', venue.prize_detail,
    'prizeQuantity', venue.prize_quantity,
    'prizeTerms', venue.prize_terms,
    'logoUrl', venue.logo_url,
    'imageUrl', venue.image_url,
    'active', venue.active
  ));
  return visit;
end;
$$;

create or replace function public.pulse_admin_upsert_tasca(
  p_admin_key text,
  p_id text,
  p_name text,
  p_slug text,
  p_zone text,
  p_city text,
  p_address text,
  p_contact text,
  p_description text,
  p_sponsor text,
  p_prize text,
  p_prize_detail text,
  p_quantity integer,
  p_terms text,
  p_starts date,
  p_ends date,
  p_logo text,
  p_image text,
  p_active boolean,
  p_cycle text,
  p_regen boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_id text;
  next_slug text;
  token text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if length(coalesce(p_logo, '')) > 180000 or length(coalesce(p_image, '')) > 180000 then
    return jsonb_build_object('ok', false, 'error', 'La imagen es demasiado pesada.');
  end if;
  if trim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'La tasca necesita un nombre.');
  end if;
  next_slug := lower(trim(coalesce(p_slug, '')));
  if next_slug = '' then
    next_slug := trim(both '-' from regexp_replace(translate(lower(trim(p_name)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'));
  end if;
  if next_slug = '' then
    return jsonb_build_object('ok', false, 'error', 'El enlace de la tasca no es válido.');
  end if;
  venue_id := trim(coalesce(p_id, ''));
  if venue_id = '' then
    venue_id := 'venue_' || replace(gen_random_uuid()::text, '-', '');
  end if;
  if exists (select 1 from public.pulse_venues where pulse_venues.slug = next_slug and id <> venue_id) then
    return jsonb_build_object('ok', false, 'error', 'Ya hay una tasca con ese enlace.');
  end if;
  token := 'q' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into public.pulse_venues (
    id, name, slug, zone, city, address, contact, description, sponsor_text,
    round_prize, prize_detail, prize_quantity, prize_terms, prize_starts, prize_ends,
    logo_url, image_url, active, cycle_id, qr_token
  ) values (
    venue_id, trim(p_name), next_slug, trim(coalesce(p_zone, '')), trim(coalesce(p_city, '')),
    trim(coalesce(p_address, '')), trim(coalesce(p_contact, '')), trim(coalesce(p_description, '')),
    trim(coalesce(p_sponsor, '')), trim(coalesce(p_prize, '')), trim(coalesce(p_prize_detail, '')),
    greatest(coalesce(p_quantity, 0), 0), trim(coalesce(p_terms, '')), p_starts, p_ends,
    coalesce(p_logo, ''), coalesce(p_image, ''), coalesce(p_active, true), coalesce(nullif(trim(p_cycle), ''), 'ronda_1'), token
  )
  on conflict (id) do update
  set name = excluded.name,
      slug = excluded.slug,
      zone = excluded.zone,
      city = excluded.city,
      address = excluded.address,
      contact = excluded.contact,
      description = excluded.description,
      sponsor_text = excluded.sponsor_text,
      round_prize = excluded.round_prize,
      prize_detail = excluded.prize_detail,
      prize_quantity = excluded.prize_quantity,
      prize_terms = excluded.prize_terms,
      prize_starts = excluded.prize_starts,
      prize_ends = excluded.prize_ends,
      logo_url = excluded.logo_url,
      image_url = excluded.image_url,
      active = excluded.active,
      cycle_id = excluded.cycle_id,
      qr_token = case when coalesce(p_regen, false) then excluded.qr_token else public.pulse_venues.qr_token end;
  return jsonb_build_object('ok', true, 'id', venue_id, 'slug', next_slug);
end;
$$;

insert into public.pulse_matches (id, home_team, away_team, starts_at, status, is_simulation, is_demo)
values ('demo_caracas_mag', 'Magallanes', 'Caracas', now() + interval '120 days', 'scheduled', true, true)
on conflict (id) do nothing;

insert into public.pulse_venues (
  id, name, slug, zone, city, address, description, sponsor_text, round_prize, prize_detail, prize_quantity, prize_terms, active, cycle_id
) values
  (
    'venue_san_jose', 'Tasca San José', 'tasca-san-jose', 'Chacao', 'Caracas', '',
    'Tasca de demostración del piloto Juégate el Tobo.',
    'Esta tasca forma parte de Juégate el Tobo.',
    'Tobo de 10 cervezas',
    'Un tobo de 10 cervezas para vivir el partido.',
    1,
    'Canje válido hasta 14 días después de ser asignado.',
    true,
    'ronda_1'
  ),
  (
    'venue_san_ramon', 'Tasca San Ramón', 'tasca-san-ramon', 'Las Mercedes', 'Caracas', '',
    'Tasca de demostración del piloto Juégate el Tobo.',
    'Esta tasca forma parte de Juégate el Tobo.',
    'Premio especial',
    'Premio de la experiencia, sujeto a la cantidad disponible.',
    1,
    'Canje válido hasta 14 días después de ser asignado.',
    true,
    'ronda_1'
  )
on conflict (id) do nothing;

revoke all on function public.pulse_demo_script(text, text, text) from public, anon, authenticated;
revoke all on function public.pulse_demo_view(public.pulse_demo_sessions) from public, anon, authenticated;
revoke all on function public.pulse_demo_settle(text) from public, anon, authenticated;
revoke all on function public.pulse_demo_bonus(integer) from public, anon, authenticated;

grant execute on function public.pulse_demo_state(text, text) to anon, authenticated;
grant execute on function public.pulse_demo_start(text, text) to anon, authenticated;
grant execute on function public.pulse_demo_answer(text, text, text, text) to anon, authenticated;
grant execute on function public.pulse_demo_log(text, text, text, text) to anon, authenticated;
grant execute on function public.pulse_venue_by_slug(text) to anon, authenticated;
grant execute on function public.pulse_venue_scan(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_upsert_tasca(text, text, text, text, text, text, text, text, text, text, text, text, integer, text, date, date, text, text, boolean, text, boolean) to anon, authenticated;
