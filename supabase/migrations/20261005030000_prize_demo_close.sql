-- Cierre de demostración. No cierra ronda_1/2/3 ni quita elegibilidad de premio.
-- Deshacer borra solo las filas marcadas is_demo.

alter table public.pulse_prizes
  add column if not exists is_demo boolean not null default false;

insert into public.pulse_cycles (id, name, starts_on, ends_on, status)
values ('demo_cierre', 'Cierre de demostración', date '2099-01-01', date '2099-01-14', 'open')
on conflict (id) do nothing;

create or replace function public.pulse_cycles_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'startsOn', starts_on,
    'endsOn', ends_on,
    'status', status
  ) order by starts_on), '[]'::jsonb)
  from public.pulse_cycles
  where id <> 'demo_cierre';
$$;

create or replace function public.pulse_admin_close_round(p_admin_key text, p_cycle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ranked record;
  slot integer := 0;
  code text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if p_cycle = 'demo_cierre' then
    return jsonb_build_object('ok', false, 'error', 'Ese cierre es solo de demostración. Usa el simulador.');
  end if;
  if not exists (select 1 from public.pulse_cycles where id = p_cycle) then
    return jsonb_build_object('ok', false, 'error', 'Esa ronda no existe.');
  end if;
  if exists (select 1 from public.pulse_prizes where cycle_id = p_cycle) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  for ranked in
    select item->'user'->>'id' as user_id, (item->>'points')::int as points
    from jsonb_array_elements(public.pulse_ranking('', p_cycle)) item
    join public.pulse_profiles profile on profile.id = item->'user'->>'id'
    where profile.prize_eligible
      and (item->>'points')::int > 0
    order by (item->>'position')::int
    limit 3
  loop
    slot := slot + 1;
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.pulse_prizes (id, cycle_id, rank_slot, winner_user_id, redemption_code, expires_at)
    values (
      'prize_' || p_cycle || '_' || slot,
      p_cycle,
      slot,
      ranked.user_id,
      code,
      now() + interval '14 days'
    );
    update public.pulse_profiles set prize_eligible = false where id = ranked.user_id;
  end loop;

  update public.pulse_cycles set status = 'closed' where id = p_cycle;
  return jsonb_build_object('ok', true, 'awarded', slot);
end;
$$;

create or replace function public.pulse_admin_simulate_round_close(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ranked record;
  slot integer := 0;
  code text;
  winners jsonb;
begin
  perform public.pulse_require_admin(p_admin_key);

  if exists (select 1 from public.pulse_prizes where is_demo) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'alias', profile.alias,
      'rank', prize.rank_slot,
      'code', prize.redemption_code
    ) order by prize.rank_slot), '[]'::jsonb)
    into winners
    from public.pulse_prizes prize
    join public.pulse_profiles profile on profile.id = prize.winner_user_id
    where prize.is_demo;
    return jsonb_build_object('ok', true, 'already', true, 'awarded', jsonb_array_length(winners), 'winners', winners);
  end if;

  for ranked in
    select item->'user'->>'id' as user_id
    from jsonb_array_elements(public.pulse_ranking('', 'lifetime')) item
    join public.pulse_profiles profile on profile.id = item->'user'->>'id'
    where profile.prize_eligible
      and (item->>'points')::int > 0
    order by (item->>'position')::int
    limit 3
  loop
    slot := slot + 1;
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.pulse_prizes (
      id, cycle_id, rank_slot, winner_user_id, redemption_code, expires_at, is_demo
    ) values (
      'prize_demo_cierre_' || slot,
      'demo_cierre',
      slot,
      ranked.user_id,
      code,
      now() + interval '14 days',
      true
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'alias', profile.alias,
    'rank', prize.rank_slot,
    'code', prize.redemption_code
  ) order by prize.rank_slot), '[]'::jsonb)
  into winners
  from public.pulse_prizes prize
  join public.pulse_profiles profile on profile.id = prize.winner_user_id
  where prize.is_demo;

  return jsonb_build_object('ok', true, 'already', false, 'awarded', slot, 'winners', winners);
end;
$$;

create or replace function public.pulse_admin_undo_round_close(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  perform public.pulse_require_admin(p_admin_key);
  delete from public.pulse_prizes where is_demo;
  get diagnostics removed = row_count;
  return jsonb_build_object('ok', true, 'removed', removed);
end;
$$;

grant execute on function public.pulse_cycles_list() to anon, authenticated;
grant execute on function public.pulse_admin_close_round(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_simulate_round_close(text) to anon, authenticated;
grant execute on function public.pulse_admin_undo_round_close(text) to anon, authenticated;
