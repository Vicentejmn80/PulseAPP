-- MVP public venue allowlist: retain existing data, but expose only the existing
-- active La Europea Beethoven ficha in the public directory, direct venue route,
-- and QR-credit flow. Admin RPCs remain unchanged and unfiltered.
create or replace function public.pulse_is_mvp_venue(p_id text, p_name text)
returns boolean
language sql
stable
as $$
  select p_id = 'venue-beethoven'
     and lower(btrim(translate(coalesce(p_name, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))) = 'la europea beethoven';
$$;

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
        'id', match.id, 'awayTeam', match.away_team, 'homeTeam', match.home_team, 'startsAt', match.starts_at
      ) order by match.starts_at)
      from public.pulse_matches match
      where match.id in (select jsonb_array_elements_text(venue.games_airing))
    ), '[]'::jsonb)
  ) order by venue.name), '[]'::jsonb)
  from public.pulse_venues venue
  where venue.active and public.pulse_is_mvp_venue(venue.id, venue.name);
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
  select * into venue
  from public.pulse_venues
  where slug = trim(coalesce(p_slug, ''))
    and active
    and public.pulse_is_mvp_venue(id, name);
  if venue.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa tasca no está activa en esta edición del MVP.');
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
    'instagram', venue.instagram,
    'whatsapp', venue.whatsapp,
    'broadcasts', venue.broadcasts,
    'description', venue.description,
    'sponsorText', venue.sponsor_text,
    'roundPrize', venue.round_prize,
    'prizeDetail', venue.prize_detail,
    'prizeQuantity', venue.prize_quantity,
    'prizeTerms', venue.prize_terms,
    'prizeStarts', venue.prize_starts,
    'prizeEnds', venue.prize_ends,
    'logoUrl', venue.logo_url,
    'imageUrl', venue.image_url,
    'isFounder', venue.is_founder,
    'cycleId', venue.cycle_id,
    'active', venue.active
  ));
end;
$$;

grant execute on function public.pulse_venue_by_slug(text) to anon, authenticated;

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
  select * into venue
  from public.pulse_venues
  where slug = trim(coalesce(p_slug, ''))
    and active
    and public.pulse_is_mvp_venue(id, name);
  if venue.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa tasca no está activa en esta edición del MVP.');
  end if;
  perform public.pulse_log_event('venue_qr_scanned', public.pulse_user_id(p_token), venue.id,
    'venue_scan:' || venue.id || ':' || coalesce(public.pulse_user_id(p_token), 'anon') || ':' || current_date::text, '{}'::jsonb);
  perform public.pulse_log_event('venue_qr_viewed', public.pulse_user_id(p_token), venue.id,
    'venue_qr:' || venue.id || ':' || coalesce(public.pulse_user_id(p_token), 'anon') || ':' || current_date::text, '{}'::jsonb);
  visit := public.pulse_qr_visit(p_token, venue.qr_token);
  if not coalesce((visit->>'ok')::boolean, false) then return visit; end if;
  visit := visit || jsonb_build_object('venue', jsonb_build_object(
    'id', venue.id,
    'name', venue.name,
    'slug', venue.slug,
    'zone', venue.zone,
    'city', venue.city,
    'address', venue.address,
    'contact', venue.contact,
    'instagram', venue.instagram,
    'whatsapp', venue.whatsapp,
    'broadcasts', venue.broadcasts,
    'description', venue.description,
    'sponsorText', venue.sponsor_text,
    'roundPrize', venue.round_prize,
    'prizeDetail', venue.prize_detail,
    'prizeQuantity', venue.prize_quantity,
    'prizeTerms', venue.prize_terms,
    'prizeStarts', venue.prize_starts,
    'prizeEnds', venue.prize_ends,
    'logoUrl', venue.logo_url,
    'imageUrl', venue.image_url,
    'isFounder', venue.is_founder,
    'cycleId', venue.cycle_id,
    'active', venue.active
  ));
  return visit;
end;
$$;

grant execute on function public.pulse_venue_scan(text, text) to anon, authenticated;

-- Generic QR token scans are also locked to the same public MVP venue, so a
-- hidden legacy/demo QR cannot grant points or surface an old venue.
create or replace function public.pulse_qr_visit(p_token text, p_qr text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  venue public.pulse_venues;
  today date := public.pulse_caracas_today();
  already boolean := false;
  points integer := 3;
  source text;
  flash jsonb;
begin
  perform public.pulse_close_due_flash();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para registrar tu visita.');
  end if;
  select * into venue from public.pulse_venues
  where qr_token = trim(coalesce(p_qr, '')) and active and public.pulse_is_mvp_venue(id, name);
  if venue.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese código no corresponde a la tasca de esta edición.');
  end if;
  insert into public.pulse_qr_scans (id, user_id, venue_id, scan_date)
  values ('scan_' || replace(gen_random_uuid()::text, '-', ''), uid, venue.id, today)
  on conflict (user_id, venue_id, scan_date) do nothing;
  already := not found;
  if not already then
    source := 'qr:' || uid || ':' || venue.id || ':' || today::text;
    perform public.pulse_credit(uid, 'qr_scan', source, points, jsonb_build_object('earnedOn', today, 'venueId', venue.id));
    perform public.pulse_log_event('qr_scan_credited', uid, venue.id, source, '{}'::jsonb);
    perform public.pulse_mark_play_day(uid);
  end if;
  select jsonb_build_object(
    'id', q.id, 'prompt', q.prompt, 'options', q.options, 'closesAt', q.closes_at,
    'status', q.status, 'myOption', a.option_id,
    'correctOption', case when q.status in ('resolved', 'void') then q.correct_option else null end,
    'points', public.pulse_cfg_int('FLASH_POINTS')
  ) into flash
  from public.pulse_flash_questions q
  left join public.pulse_flash_answers a on a.question_id = q.id and a.user_id = uid
  where q.status = 'open' and q.opens_at <= now() and q.closes_at > now()
    and (q.venue_id is null or q.venue_id = venue.id)
  order by q.closes_at limit 1;
  return jsonb_build_object(
    'ok', true, 'already', already, 'points', case when already then 0 else points end,
    'venue', jsonb_build_object(
      'id', venue.id, 'name', venue.name, 'zone', venue.zone, 'address', venue.address,
      'contact', venue.contact, 'broadcasts', venue.broadcasts, 'isFounder', venue.is_founder
    ),
    'flash', flash
  );
end;
$$;

grant execute on function public.pulse_qr_visit(text, text) to anon, authenticated;
