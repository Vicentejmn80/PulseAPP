-- Retain challenge validation and allow the UI to independently resave choices
-- after the official prediction exists. Prediction scores are never touched here.
create or replace function public.pulse_save_challenge_answers(p_token text, p_match text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  item jsonb;
  challenge public.pulse_game_challenges;
  option_id text;
  challenge_id text;
  seen text[] := '{}';
  saved integer := 0;
begin
  perform public.pulse_lock_due_matches();
  uid := public.pulse_user_id(p_token);
  if uid is null then return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para guardar los retos.'); end if;
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.'); end if;
  if match.status in ('finished', 'cancelled', 'locked') or match.starts_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. Los retos están cerrados.');
  end if;
  if match.status not in ('scheduled', 'postponed') then
    return jsonb_build_object('ok', false, 'error', 'Este juego no está abierto para editar retos.');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Elige los retos de nuevo.');
  end if;
  if jsonb_array_length(p_answers) > 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya elegiste 3 retos. Cambia uno para seleccionar otro.');
  end if;

  for item in select value from jsonb_array_elements(p_answers)
  loop
    challenge_id := item->>'challengeId';
    option_id := item->>'optionId';
    if challenge_id is null or challenge_id = any(seen) then
      return jsonb_build_object('ok', false, 'error', 'Revisa los retos elegidos.');
    end if;
    seen := seen || challenge_id;
    select * into challenge from public.pulse_game_challenges where id = challenge_id and game_id = match.id;
    if challenge.id is null then return jsonb_build_object('ok', false, 'error', 'Ese reto no pertenece a este partido.'); end if;
    if not exists (select 1 from jsonb_array_elements(challenge.options) opt where opt->>'id' = option_id) then
      return jsonb_build_object('ok', false, 'error', 'Esa opción no existe.');
    end if;
  end loop;

  delete from public.pulse_challenge_answers ans
  using public.pulse_game_challenges gc
  where ans.game_challenge_id = gc.id and ans.user_id = uid and gc.game_id = match.id
    and ans.evaluated_at is null and not (ans.game_challenge_id = any(seen));

  for item in select value from jsonb_array_elements(p_answers)
  loop
    challenge_id := item->>'challengeId';
    option_id := item->>'optionId';
    insert into public.pulse_challenge_answers (id, user_id, game_challenge_id, option_id)
    values ('cha_' || substr(md5(uid || ':' || challenge_id), 1, 24), uid, challenge_id, option_id)
    on conflict (user_id, game_challenge_id) do update
      set option_id = excluded.option_id
      where public.pulse_challenge_answers.evaluated_at is null
        and public.pulse_challenge_answers.option_id is distinct from excluded.option_id;
    saved := saved + 1;
  end loop;
  return jsonb_build_object('ok', true, 'saved', saved);
end;
$$;

grant execute on function public.pulse_save_challenge_answers(text, text, jsonb) to anon, authenticated;
