-- Libera sesiones de trivia que quedaron abiertas con preguntas ya desactivadas.
-- No borra respuestas, puntos ni el historial. La siguiente apertura de Iniciado
-- elige 4 preguntas activas con la rotación de America/Caracas.
-- No aplicar en producción sin aprobación explícita.

create or replace function public.pulse_trivia_start(p_token text, p_level text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  diff text;
  open_row public.pulse_trivia_sessions%rowtype;
  last_at timestamptz;
  new_id text;
  picked jsonb;
  questions jsonb;
begin
  uid := public.pulse_user_id(p_token);
  diff := public.pulse_trivia_difficulty(p_level);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  if diff is null then
    return jsonb_build_object('ok', false, 'error', 'Esa dificultad no existe.');
  end if;

  select * into open_row
  from public.pulse_trivia_sessions
  where user_id = uid and difficulty = diff and completed_at is null
  order by started_at desc
  limit 1
  for update;

  if open_row.id is not null and exists (
    select 1
    from jsonb_array_elements_text(open_row.question_ids) item(id)
    left join public.pulse_trivia_questions question
      on question.id = item.id and question.status = 'active'
    where question.id is null
  ) then
    update public.pulse_trivia_sessions
    set completed_at = now(),
        available_at = now()
    where id = open_row.id;
    open_row.id := null;
  end if;

  if open_row.id is not null and not exists (
    select 1
    from jsonb_array_elements_text(open_row.question_ids) item(id)
    where not exists (
      select 1 from public.pulse_trivia_answers answer
      where answer.session_id = open_row.id and answer.question_id = item.id
    )
  ) then
    update public.pulse_trivia_sessions
    set completed_at = coalesce(completed_at, now()),
        available_at = coalesce(available_at, now() + interval '4 hours')
    where id = open_row.id
    returning available_at into last_at;
    return jsonb_build_object(
      'ok', false,
      'code', 'COOLDOWN',
      'error', 'Esta dificultad vuelve más tarde.',
      'availableAt', last_at,
      'serverNow', now()
    );
  end if;

  if open_row.id is null then
    select available_at into last_at
    from public.pulse_trivia_sessions
    where user_id = uid and difficulty = diff and completed_at is not null
    order by completed_at desc
    limit 1;
    if last_at is not null and last_at > now() then
      return jsonb_build_object(
        'ok', false,
        'code', 'COOLDOWN',
        'error', 'Esta dificultad vuelve más tarde.',
        'availableAt', last_at,
        'serverNow', now()
      );
    end if;

    new_id := 'tvs_' || substr(md5(uid || ':' || diff || ':' || clock_timestamp()::text || ':' || gen_random_uuid()::text), 1, 24);
    if diff = 'easy' then
      select coalesce(jsonb_agg(id order by ord), '[]'::jsonb) into picked
      from (
        select chosen.id, row_number() over () as ord
        from (
          select question.id
          from public.pulse_trivia_questions question
          left join lateral (
            select max(answer.answered_at) as last_seen
            from public.pulse_trivia_answers answer
            where answer.user_id = uid and answer.question_id = question.id
          ) seen on true
          where question.status = 'active' and question.difficulty = 'easy'
          order by seen.last_seen asc nulls first,
                   md5(question.id || ':' || uid || ':' || ((now() at time zone 'America/Caracas')::date)::text)
          limit 4
        ) chosen
      ) ordered;
    else
      select coalesce(jsonb_agg(id), '[]'::jsonb) into picked
      from (
        select question.id
        from public.pulse_trivia_questions question
        where question.status = 'active' and question.difficulty = diff
        order by md5(question.id || new_id)
        limit 4
      ) chosen;
    end if;

    if jsonb_array_length(picked) = 0 then
      return jsonb_build_object('ok', false, 'error', 'No hay preguntas para esta dificultad.');
    end if;

    insert into public.pulse_trivia_sessions (id, user_id, difficulty, question_ids)
    values (new_id, uid, diff, picked);
    select * into open_row from public.pulse_trivia_sessions where id = new_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'prompt', q.prompt,
    'options', q.options,
    'category', q.category,
    'difficulty', q.difficulty,
    'points', case q.difficulty
      when 'easy' then 2
      when 'medium' then 4
      when 'hard' then 6
      else q.points
    end,
    'publishDate', (now() at time zone 'America/Caracas')::date,
    'answered', exists (
      select 1 from public.pulse_trivia_answers a
      where a.session_id = open_row.id and a.question_id = q.id
    )
  ) order by ord), '[]'::jsonb)
  into questions
  from jsonb_array_elements_text(open_row.question_ids) with ordinality as item(id, ord)
  join public.pulse_trivia_questions q on q.id = item.id and q.status = 'active';

  return jsonb_build_object(
    'ok', true,
    'sessionId', open_row.id,
    'level', p_level,
    'difficulty', diff,
    'questions', questions,
    'serverNow', now(),
    'availableAt', open_row.available_at
  );
end;
$$;

grant execute on function public.pulse_trivia_start(text, text) to anon, authenticated;
