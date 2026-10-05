-- El canje no exige una tasca. Si se indica una, queda solo como dato.

alter table public.pulse_prizes
  add column if not exists redeemed_venue_id text;

drop function if exists public.pulse_admin_redeem(text, text);

create or replace function public.pulse_admin_redeem(
  p_admin_key text,
  p_code text,
  p_venue_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prize public.pulse_prizes;
  venue_id text;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into prize
  from public.pulse_prizes
  where redemption_code = upper(trim(coalesce(p_code, '')))
  for update;

  if prize.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese código no existe.');
  end if;
  if prize.status = 'redeemed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if prize.status = 'expired' or prize.expires_at <= now() then
    update public.pulse_prizes set status = 'expired' where id = prize.id and status <> 'redeemed';
    return jsonb_build_object('ok', false, 'error', 'Ese código venció.');
  end if;

  venue_id := nullif(trim(coalesce(p_venue_id, '')), '');
  if venue_id is not null and not exists (select 1 from public.pulse_venues where id = venue_id) then
    venue_id := null;
  end if;

  update public.pulse_prizes
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_venue_id = venue_id
  where id = prize.id;

  return jsonb_build_object('ok', true, 'already', false);
end;
$$;

create or replace function public.pulse_admin_prizes(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_prizes
  set status = 'expired'
  where status = 'assigned'
    and expires_at <= now();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', prize.id,
      'code', prize.redemption_code,
      'status', prize.status,
      'rank', prize.rank_slot,
      'cycleName', cycle.name,
      'alias', profile.alias,
      'expiresAt', prize.expires_at,
      'venueName', venue.name,
      'daysLeft', greatest(0, ceil(extract(epoch from (prize.expires_at - now())) / 86400.0))::int
    ) order by prize.expires_at desc)
    from public.pulse_prizes prize
    join public.pulse_cycles cycle on cycle.id = prize.cycle_id
    join public.pulse_profiles profile on profile.id = prize.winner_user_id
    left join public.pulse_venues venue on venue.id = prize.redeemed_venue_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.pulse_admin_redeem(text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_prizes(text) to anon, authenticated;
