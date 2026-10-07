-- Trivia credits were keyed only by question and day, so the unique
-- (source_type, source_id) index kept a single transaction. Later correct
-- answers updated that row and never reached the other profiles.

create or replace function public.pulse_trivia_answer(
  p_token text,
  p_question_id text,
  p_option_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_today date;
  v_question public.pulse_trivia_questions%rowtype;
  v_is_correct boolean;
  v_points integer;
  v_already boolean;
  v_source text;
begin
  v_user_id := public.pulse_user_id(p_token);
  v_today := (now() at time zone 'America/Caracas')::date;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sesion invalida.');
  end if;

  select * into v_question
  from public.pulse_trivia_questions
  where id = p_question_id
    and status = 'active';

  if v_question.id is null then
    return jsonb_build_object('ok', false, 'error', 'Pregunta no disponible.');
  end if;

  select exists(
    select 1 from public.pulse_trivia_answers
    where question_id = p_question_id
      and user_id = v_user_id
      and publish_date = v_today
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', false, 'error', 'Ya respondiste esta pregunta hoy.');
  end if;

  if p_option_id <> '__timeout__'
     and not exists (
       select 1 from jsonb_array_elements(v_question.options) option
       where option->>'id' = p_option_id
     ) then
    return jsonb_build_object('ok', false, 'error', 'Esa respuesta no existe.');
  end if;

  v_is_correct := v_question.correct_option = p_option_id;
  v_points := case when v_is_correct then v_question.points else 0 end;

  insert into public.pulse_trivia_answers
    (question_id, user_id, option_id, is_correct, points, publish_date)
  values
    (p_question_id, v_user_id, p_option_id, v_is_correct, v_points, v_today);

  if v_points > 0 then
    v_source := v_user_id || ':' || p_question_id || ':' || v_today::text;
    perform public.pulse_credit(
      v_user_id,
      'trivia',
      v_source,
      v_points,
      jsonb_build_object(
        'questionId', p_question_id,
        'publishDate', v_today::text,
        'earnedOn', v_today::text
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_is_correct,
    'points', v_points,
    'correctOption', v_question.correct_option,
    'explanation', coalesce(v_question.explanation, '')
  );
end;
$$;

grant execute on function public.pulse_trivia_answer(text, text, text) to anon, authenticated;

-- Give each correct answer its own ledger row when it never received one.
do $$
declare
  ans record;
begin
  for ans in
    select a.user_id, a.question_id::text as question_id, a.publish_date, a.points
    from public.pulse_trivia_answers a
    where a.is_correct
      and a.points > 0
      and not exists (
        select 1
        from public.pulse_transactions tx
        where tx.user_id = a.user_id
          and tx.source_type = 'trivia'
          and (
            tx.source_id = a.user_id || ':' || a.question_id::text || ':' || a.publish_date::text
            or tx.source_id = a.question_id::text || '_' || a.publish_date::text
            or (
              coalesce(tx.metadata->>'questionId', '') = a.question_id::text
              and coalesce(tx.metadata->>'publishDate', tx.metadata->>'earnedOn', '') = a.publish_date::text
            )
          )
      )
  loop
    perform public.pulse_credit(
      ans.user_id,
      'trivia',
      ans.user_id || ':' || ans.question_id || ':' || ans.publish_date::text,
      ans.points,
      jsonb_build_object(
        'questionId', ans.question_id,
        'publishDate', ans.publish_date::text,
        'earnedOn', ans.publish_date::text
      )
    );
  end loop;
end $$;

update public.pulse_transactions
set metadata = metadata || jsonb_build_object('earnedOn', metadata->>'publishDate')
where source_type = 'trivia'
  and coalesce(metadata->>'earnedOn', '') = ''
  and coalesce(metadata->>'publishDate', '') <> '';

create or replace function public.pulse_cycle_points(p_user_id text, p_cycle text default 'lifetime')
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cycle_start date;
  cycle_end date;
  total integer;
begin
  if p_cycle is null or p_cycle = 'lifetime' then
    cycle_start := null;
    cycle_end := null;
  else
    select starts_on, ends_on into cycle_start, cycle_end
    from public.pulse_cycles where id = p_cycle;
    if cycle_start is null then return 0; end if;
  end if;

  select coalesce(sum(tx.points), 0)::integer into total
  from public.pulse_transactions tx
  left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
  where tx.user_id = p_user_id
    and not coalesce((tx.metadata->>'simulation')::boolean, false)
    and (
      tx.metadata->>'matchId' is null
      or (match.id is not null and not match.is_simulation and not match.is_demo)
    )
    and (
      cycle_start is null
      or coalesce(
        (match.starts_at at time zone 'America/Caracas')::date,
        nullif(tx.metadata->>'earnedOn', '')::date,
        nullif(tx.metadata->>'publishDate', '')::date,
        (tx.created_at at time zone 'America/Caracas')::date
      ) between cycle_start and cycle_end
    );
  return total;
end;
$$;

revoke all on function public.pulse_cycle_points(text, text) from public, anon, authenticated;
