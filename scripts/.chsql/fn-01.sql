create or replace function public.pulse_match_challenges(p_token text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
begin
  uid := public.pulse_user_id(p_token);
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if not exists (select 1 from public.pulse_game_challenges where game_id = match.id) then
    perform public.pulse_assign_game_challenges(match.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'max', 3,
    'finished', match.status = 'finished',
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gc.id,
        'position', gc.position,
        'points', gc.points,
        'title', gc.title,
        'description', gc.description,
        'category', gc.category,
        'difficulty', gc.difficulty,
        'answerType', gc.answer_type,
        'options', gc.options,
        'myOption', ans.option_id,
        'evaluated', ans.evaluated_at is not null,
        'correct', case when match.status = 'finished' then ans.correct else null end,
        'pointsAwarded', case when match.status = 'finished' then coalesce(ans.points_awarded, 0) else null end,
        'correctOption', case
          when match.status = 'finished' and match.home_score is not null and match.away_score is not null
            then public.pulse_challenge_correct_option(gc.scoring_rule, match.home_score, match.away_score)
          else null
        end
      ) order by gc.position)
      from public.pulse_game_challenges gc
      left join public.pulse_challenge_answers ans
        on ans.game_challenge_id = gc.id and ans.user_id = uid
      where gc.game_id = match.id
    ), '[]'::jsonb)
  );
end;
$$;

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
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para guardar el pronóstico.');
  end if;
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status in ('finished', 'cancelled', 'locked') or match.starts_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. Los retos están cerrados.');
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
    if challenge.id is null then
      return jsonb_build_object('ok', false, 'error', 'Ese reto no pertenece a este partido.');
    end if;
    if not exists (
      select 1 from jsonb_array_elements(challenge.options) opt
      where opt->>'id' = option_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Esa opción no existe.');
    end if;
  end loop;

  delete from public.pulse_challenge_answers ans
  using public.pulse_game_challenges gc
  where ans.game_challenge_id = gc.id
    and ans.user_id = uid
    and gc.game_id = match.id
    and ans.evaluated_at is null
    and not (ans.game_challenge_id = any(seen));

  for item in select value from jsonb_array_elements(p_answers)
  loop
    challenge_id := item->>'challengeId';
    option_id := item->>'optionId';
    insert into public.pulse_challenge_answers (id, user_id, game_challenge_id, option_id)
    values (
      'cha_' || substr(md5(uid || ':' || challenge_id), 1, 24),
      uid,
      challenge_id,
      option_id
    )
    on conflict (user_id, game_challenge_id) do update
    set option_id = excluded.option_id
    where public.pulse_challenge_answers.evaluated_at is null
      and public.pulse_challenge_answers.option_id is distinct from excluded.option_id;
    saved := saved + 1;
  end loop;

  return jsonb_build_object('ok', true, 'saved', saved);
end;
$$;

create or replace function public.pulse_evaluate_match_challenges(p_match text, p_home integer, p_away integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  row record;
  right_option text;
  hit boolean;
  bonus integer;
  awarded integer := 0;
begin
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null or p_home is null or p_away is null then
    return 0;
  end if;

  for row in
    select ans.id, ans.user_id, ans.option_id, ans.evaluated_at, gc.id as challenge_id, gc.points, gc.scoring_rule
    from public.pulse_challenge_answers ans
    join public.pulse_game_challenges gc on gc.id = ans.game_challenge_id
    where gc.game_id = p_match
    for update of ans
  loop
    right_option := public.pulse_challenge_correct_option(row.scoring_rule, p_home, p_away);
    hit := row.option_id = right_option;
    bonus := case when hit then row.points else 0 end;
    if row.evaluated_at is null then
      insert into public.pulse_analytics_events (user_id, event_name, properties)
      values (
        row.user_id,
        case when hit then 'challenge_correct' else 'challenge_incorrect' end,
        jsonb_build_object('matchId', p_match, 'challengeId', row.challenge_id, 'points', bonus)
      );
      if hit then
        insert into public.pulse_analytics_events (user_id, event_name, properties)
        values (
          row.user_id,
          'challenge_bonus_awarded',
          jsonb_build_object('matchId', p_match, 'challengeId', row.challenge_id, 'points', bonus)
        );
      end if;
    end if;

    update public.pulse_challenge_answers
    set correct = hit,
        points_awarded = bonus,
        evaluated_at = coalesce(evaluated_at, now())
    where id = row.id;

    if bonus > 0 then
      insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
      values (
        'tx_chg_' || substr(md5(row.user_id || ':' || row.challenge_id), 1, 24),
        row.user_id,
        'exp_tobo',
        'game_challenge',
        row.user_id || ':' || row.challenge_id,
        bonus,
        jsonb_build_object(
          'matchId', p_match,
          'challengeId', row.challenge_id,
          'homeScore', p_home,
          'awayScore', p_away,
          'matchStartsAt', match.starts_at,
          'kind', 'GAME_CHALLENGE_CORRECT'
        )
      )
      on conflict (source_type, source_id) do update
      set points = excluded.points,
          metadata = excluded.metadata
      where public.pulse_transactions.points is distinct from excluded.points;
      awarded := awarded + bonus;
    else
      delete from public.pulse_transactions
      where source_type = 'game_challenge'
        and source_id = row.user_id || ':' || row.challenge_id;
    end if;
  end loop;

  return awarded;
end;
$$;

create or replace function public.pulse_admin_create_match(
  p_admin_key text,
  p_home text,
  p_away text,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if trim(coalesce(p_home, '')) = '' or trim(coalesce(p_away, '')) = '' or trim(p_home) = trim(p_away) then
    return jsonb_build_object('ok', false, 'error', 'Escribe dos equipos distintos.');
  end if;
  if p_starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'Indica la fecha y hora del partido.');
  end if;
  new_id := 'match_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_matches (id, home_team, away_team, starts_at)
  values (new_id, trim(p_home), trim(p_away), p_starts_at);
  perform public.pulse_assign_game_challenges(new_id);
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

