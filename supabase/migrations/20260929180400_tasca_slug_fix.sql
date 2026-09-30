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

grant execute on function public.pulse_admin_upsert_tasca(text, text, text, text, text, text, text, text, text, text, text, text, integer, text, date, date, text, text, boolean, text, boolean) to anon, authenticated;
