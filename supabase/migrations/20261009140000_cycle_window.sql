-- Devuelve solo el top, mi fila y la zona vecina. El orden sigue siendo el de pulse_ranking.
create or replace function public.pulse_cycle_window(
  p_token text,
  p_cycle text,
  p_league_id text default null,
  p_top integer default 10,
  p_neighbors integer default 2
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid text;
  board jsonb;
  total integer;
  my_pos integer;
  top_n integer;
  neighbors integer;
  zone_start integer;
  zone_end integer;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para consultar el ranking.');
  end if;
  if p_league_id is not null and not exists (
    select 1 from public.pulse_league_members member
    where member.league_id = p_league_id and member.user_id = uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'No perteneces a esa liga.');
  end if;

  board := public.pulse_ranking(p_token, p_cycle, p_league_id);
  total := coalesce(jsonb_array_length(board), 0);
  top_n := greatest(1, least(coalesce(p_top, 10), 50));
  neighbors := greatest(0, least(coalesce(p_neighbors, 2), 20));

  select (elem->>'position')::integer into my_pos
  from jsonb_array_elements(board) elem
  where coalesce((elem->>'isCurrentUser')::boolean, false)
  limit 1;

  if my_pos is null or my_pos <= top_n then
    zone_start := null;
    zone_end := null;
  else
    zone_start := greatest(top_n + 1, my_pos - neighbors);
    zone_end := least(total, my_pos + neighbors);
  end if;

  return jsonb_build_object(
    'ok', true,
    'points', public.pulse_cycle_points(uid, p_cycle),
    'total', total,
    'top', coalesce((
      select jsonb_agg(elem order by (elem->>'position')::integer)
      from jsonb_array_elements(board) elem
      where (elem->>'position')::integer <= top_n
    ), '[]'::jsonb),
    'zone', case
      when zone_start is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(elem order by (elem->>'position')::integer)
        from jsonb_array_elements(board) elem
        where (elem->>'position')::integer between zone_start and zone_end
      ), '[]'::jsonb)
    end,
    'above', (
      select elem
      from jsonb_array_elements(board) elem
      where my_pos is not null and (elem->>'position')::integer = my_pos - 1
      limit 1
    )
  );
end;
$$;

grant execute on function public.pulse_cycle_window(text, text, text, integer, integer) to anon, authenticated;
