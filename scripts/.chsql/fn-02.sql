create or replace function public.pulse_admin_set_result(
  p_admin_key text,
  p_match_id text,
  p_home_score integer,
  p_away_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  pred public.pulse_match_predictions;
  breakdown jsonb;
  awarded integer := 0;
  scored integer := 0;
  same_result boolean;
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_lock_due_matches();
  select * into match from public.pulse_matches where id = p_match_id for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status in ('cancelled') then
    return jsonb_build_object('ok', false, 'error', 'Un juego cancelado no otorga puntos.');
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'El resultado no puede quedar empatado.');
  end if;

  same_result := match.status = 'finished'
    and match.home_score = p_home_score
    and match.away_score = p_away_score;

  if not same_result then
    update public.pulse_matches
    set home_score = p_home_score,
        away_score = p_away_score,
        status = 'finished',
        updated_at = now()
    where id = match.id;
  end if;

  for pred in
    select * from public.pulse_match_predictions
    where match_id = match.id
      and (processed_at is null or not same_result)
    for update
  loop
    breakdown := public.pulse_score_breakdown(
      pred.predicted_home_score, pred.predicted_away_score, p_home_score, p_away_score
    ) || jsonb_build_object(
      'matchId', match.id,
      'homeScore', p_home_score,
      'awayScore', p_away_score,
      'matchStartsAt', match.starts_at
    );
    insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
    values (
      'tx_' || pred.id, pred.user_id, 'exp_tobo', 'prediction', pred.id, (breakdown->>'total')::int, breakdown
    )
    on conflict (source_type, source_id) do update
    set points = excluded.points,
        metadata = excluded.metadata || jsonb_build_object('correctedAt', now())
    where public.pulse_transactions.points is distinct from excluded.points
       or public.pulse_transactions.metadata->>'homeScore' is distinct from excluded.metadata->>'homeScore'
       or public.pulse_transactions.metadata->>'awayScore' is distinct from excluded.metadata->>'awayScore';
    if found then
      scored := scored + 1;
      awarded := awarded + (breakdown->>'total')::int;
    end if;
    update public.pulse_match_predictions
    set processed_at = coalesce(processed_at, now()),
        locked_at = coalesce(locked_at, match.starts_at)
    where id = pred.id;
  end loop;

  perform public.pulse_evaluate_match_challenges(match.id, p_home_score, p_away_score);
  perform public.pulse_resolve_duels(match.id);
  return jsonb_build_object('ok', true, 'scored', scored, 'points', awarded);
end;
$$;

create or replace function public.pulse_admin_challenge_templates(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', t.code,
      'title', t.title,
      'category', t.category,
      'difficulty', t.difficulty,
      'points', t.points,
      'active', t.active,
      'usage', coalesce(use.uses, 0),
      'answers', coalesce(use.answers, 0),
      'correct', coalesce(use.correct, 0),
      'accuracy', case when coalesce(use.answers, 0) = 0 then null else round(100.0 * use.correct / use.answers) end,
      'selectionRate', case when coalesce(use.uses, 0) = 0 then null else round(100.0 * use.answers / use.uses) end
    ) order by t.category, t.points, t.code)
    from public.pulse_challenge_templates t
    left join (
      select gc.template_id,
             count(distinct gc.id)::int as uses,
             count(ans.id)::int as answers,
             count(ans.id) filter (where ans.correct)::int as correct
      from public.pulse_game_challenges gc
      left join public.pulse_challenge_answers ans on ans.game_challenge_id = gc.id and ans.evaluated_at is not null
      group by gc.template_id
    ) use on use.template_id = t.id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_admin_set_challenge_template(
  p_admin_key text,
  p_code text,
  p_active boolean,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_challenge_templates
  set active = coalesce(p_active, active),
      title = case when nullif(trim(p_title), '') is null then title else trim(p_title) end
  where code = p_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa plantilla no existe.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.pulse_match_challenges(text, text) to anon, authenticated;
grant execute on function public.pulse_save_challenge_answers(text, text, jsonb) to anon, authenticated;
grant execute on function public.pulse_admin_challenge_templates(text) to anon, authenticated;
grant execute on function public.pulse_admin_set_challenge_template(text, text, boolean, text) to anon, authenticated;

