-- Hace visible a Garrison Barber Society junto a La Europea Beethoven.
-- No abre el canje: el QR queda vacío a propósito.

create or replace function public.pulse_is_mvp_venue(p_id text, p_name text)
returns boolean
language sql
stable
as $$
  select (
    p_id = 'venue-beethoven'
    and lower(btrim(translate(coalesce(p_name, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))) = 'la europea beethoven'
  ) or (
    p_id = 'venue-garrison'
    and lower(btrim(translate(coalesce(p_name, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))) = 'garrison barber society'
  );
$$;

insert into public.pulse_venues (
  id, name, zone, address, contact, is_founder, active,
  broadcasts, instagram, whatsapp, round_prize, games_airing, slug,
  logo_url, image_url, description, city, sponsor_text,
  prize_detail, prize_quantity, prize_terms, cycle_id, highlights, qr_token
) values (
  'venue-garrison',
  'Garrison Barber Society',
  'Por confirmar',
  'Por confirmar',
  'Por confirmar',
  false,
  true,
  '',
  '',
  '',
  'Beneficio en tu primera visita',
  '[]'::jsonb,
  'garrison-barber-society',
  '/allies/garrison-mark.png',
  '/allies/garrison-mark.png',
  'Barbería aliada de Rusher. El beneficio de la primera visita se anuncia al escanear el QR en el local.',
  '',
  'Aliado oficial',
  'Se activa escaneando el QR en la barbería.',
  0,
  'El canje todavía no está configurado. No hay un código QR activo.',
  'ronda_1',
  '[{"icon":"✂️","title":"Barbería","desc":"Aliado oficial"}]'::jsonb,
  null
)
on conflict (id) do nothing;

update public.pulse_venues
set qr_token = null
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
