do $$
declare game_id text;
begin
  if exists (
    select 1 from public.pulse_challenge_templates
    where active and (scoring_rule is null or scoring_rule->>'op' is null)
  ) then
    raise exception 'Hay una plantilla activa sin scoring_rule';
  end if;
  for game_id in
    select id from public.pulse_matches
    where status in ('scheduled', 'postponed')
  loop
    perform public.pulse_assign_game_challenges(game_id);
  end loop;
end $$;
