-- Atomically returns the personal cycle total and the matching ranking rows.
create or replace function public.pulse_cycle_board(
  p_token text,
  p_cycle text,
  p_league_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid text;
  rows jsonb;
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
  rows := public.pulse_ranking(p_token, p_cycle, p_league_id);
  return jsonb_build_object(
    'ok', true,
    'entries', rows,
    'points', public.pulse_cycle_points(uid, p_cycle)
  );
end;
$$;

grant execute on function public.pulse_cycle_board(text, text, text) to anon, authenticated;
