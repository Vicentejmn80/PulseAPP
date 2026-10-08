-- Each difficulty keeps its own session. A new cycle is allowed only after
-- available_at (completed_at + 4 hours), measured with the database clock.
-- Historical answers stay. Points are keyed by session + question, so a replay
-- of the same session cannot credit twice and a later session can.

create table if not exists public.pulse_trivia_sessions (
  id text primary key,
  user_id text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  question_ids jsonb not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  available_at timestamptz
);

create unique index if not exists pulse_trivia_sessions_one_open
  on public.pulse_trivia_sessions (user_id, difficulty)
  where completed_at is null;

create index if not exists pulse_trivia_sessions_user_diff
  on public.pulse_trivia_sessions (user_id, difficulty, completed_at desc);

alter table public.pulse_trivia_sessions enable row level security;

alter table public.pulse_trivia_answers
  add column if not exists session_id text,
  add column if not exists answer_key text;

update public.pulse_trivia_answers
set answer_key = user_id || ':' || question_id || ':' || coalesce(publish_date::text, 'legacy')
where answer_key is null;

alter table public.pulse_trivia_answers drop constraint if exists pulse_trivia_answers_pkey;
alter table public.pulse_trivia_answers alter column answer_key set not null;
alter table public.pulse_trivia_answers add primary key (answer_key);

drop index if exists public.pulse_trivia_answers_one_attempt;

create unique index if not exists pulse_trivia_answers_session_question
  on public.pulse_trivia_answers (session_id, question_id);

comment on table public.pulse_trivia_sessions is
  'One open trivia session per user and difficulty. available_at = completed_at + 4 hours.';

create or replace function public.pulse_trivia_difficulty(p_level text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_level, '')))
    when 'beginner' then 'easy'
    when 'iniciado' then 'easy'
    when 'easy' then 'easy'
    when 'intermediate' then 'medium'
    when 'intermedio' then 'medium'
    when 'medium' then 'medium'
    when 'advanced' then 'hard'
    when 'avanzado' then 'hard'
    when 'hard' then 'hard'
    else null
  end;
$$;

create or replace function public.pulse_trivia_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid text;
  server_now timestamptz := now();
  levels text[] := array['beginner', 'intermediate', 'advanced'];
  diffs text[] := array['easy', 'medium', 'hard'];
  i integer;
  open_row public.pulse_trivia_sessions%rowtype;
  last_at timestamptz;
  answered integer;
  total integer;
  rows jsonb := '[]'::jsonb;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;

  for i in 1..3 loop
    open_row := null;
    last_at := null;
    select * into open_row
    from public.pulse_trivia_sessions
    where user_id = uid and difficulty = diffs[i] and completed_at is null
    order by started_at desc
    limit 1;

    if open_row.id is not null then
      total := jsonb_array_length(open_row.question_ids);
      select count(*) into answered
      from public.pulse_trivia_answers
      where session_id = open_row.id;
      rows := rows || jsonb_build_array(jsonb_build_object(
        'level', levels[i],
        'difficulty', diffs[i],
        'status', 'in_progress',
        'sessionId', open_row.id,
        'questionCount', total,
        'answeredCount', answered,
        'availableAt', null,
        'serverNow', server_now
      ));
    else
      select available_at into last_at
      from public.pulse_trivia_sessions
      where user_id = uid and difficulty = diffs[i] and completed_at is not null
      order by completed_at desc
      limit 1;
      total := (
        select count(*) from public.pulse_trivia_questions
        where status = 'active' and difficulty = diffs[i]
      );
      rows := rows || jsonb_build_array(jsonb_build_object(
        'level', levels[i],
        'difficulty', diffs[i],
        'status', case when last_at is not null and last_at > server_now then 'cooldown' else 'available' end,
        'sessionId', null,
        'questionCount', least(4, total),
        'answeredCount', case when last_at is not null and last_at > server_now then least(4, total) else 0 end,
        'availableAt', case when last_at is not null and last_at > server_now then last_at else null end,
        'serverNow', server_now
      ));
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'serverNow', server_now, 'levels', rows);
end;
$$;

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

  if open_row.id is not null and not exists (
    select 1
    from jsonb_array_elements_text(open_row.question_ids) item(id)
    where not exists (
      select 1 from public.pulse_trivia_answers a
      where a.session_id = open_row.id and a.question_id = item.id
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
    select coalesce(jsonb_agg(id), '[]'::jsonb) into picked
    from (
      select question.id
      from public.pulse_trivia_questions question
      where question.status = 'active' and question.difficulty = diff
      order by md5(question.id || new_id)
      limit 4
    ) chosen;

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
    'points', q.points,
    'publishDate', (now() at time zone 'America/Caracas')::date,
    'answered', exists (
      select 1 from public.pulse_trivia_answers a
      where a.session_id = open_row.id and a.question_id = q.id
    )
  ) order by ord), '[]'::jsonb)
  into questions
  from jsonb_array_elements_text(open_row.question_ids) with ordinality as item(id, ord)
  join public.pulse_trivia_questions q on q.id = item.id;

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

create or replace function public.pulse_trivia_answer(
  p_token text,
  p_question_id text,
  p_option_id text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  sess public.pulse_trivia_sessions%rowtype;
  question public.pulse_trivia_questions%rowtype;
  existing public.pulse_trivia_answers%rowtype;
  is_correct boolean;
  awarded integer;
  today date := (now() at time zone 'America/Caracas')::date;
  inserted text;
  remaining integer;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  if coalesce(p_session_id, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'SESSION_REQUIRED', 'error', 'Inicia la trivia para responder.');
  end if;

  select * into sess
  from public.pulse_trivia_sessions
  where id = p_session_id and user_id = uid
  for update;
  if sess.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa sesión de trivia no existe.');
  end if;

  if not exists (
    select 1 from jsonb_array_elements_text(sess.question_ids) item(id)
    where item.id = p_question_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no pertenece a esta sesión.');
  end if;

  select * into existing
  from public.pulse_trivia_answers
  where session_id = sess.id and question_id = p_question_id;
  if existing.answer_key is not null then
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'correct', existing.is_correct,
      'points', 0,
      'correctOption', coalesce((
        select correct_option from public.pulse_trivia_questions where id = p_question_id
      ), ''),
      'explanation', '',
      'completed', sess.completed_at is not null,
      'availableAt', sess.available_at,
      'serverNow', now()
    );
  end if;

  if sess.completed_at is not null or (sess.available_at is not null and sess.available_at > now() and sess.completed_at is not null) then
    return jsonb_build_object(
      'ok', false,
      'code', 'COOLDOWN',
      'error', 'Esta dificultad todavía no está disponible.',
      'availableAt', sess.available_at,
      'serverNow', now()
    );
  end if;

  select * into question
  from public.pulse_trivia_questions
  where id = p_question_id and status = 'active';
  if question.id is null then
    return jsonb_build_object('ok', false, 'error', 'Pregunta no disponible.');
  end if;

  if p_option_id <> '__timeout__'
     and not exists (
       select 1 from jsonb_array_elements(question.options) option
       where option->>'id' = p_option_id
     ) then
    return jsonb_build_object('ok', false, 'error', 'Esa respuesta no existe.');
  end if;

  is_correct := question.correct_option = p_option_id;
  awarded := case when is_correct then question.points else 0 end;

  insert into public.pulse_trivia_answers (
    answer_key, question_id, user_id, option_id, is_correct, points, publish_date, session_id, answered_at
  ) values (
    sess.id || ':' || p_question_id,
    p_question_id, uid, p_option_id, is_correct, awarded, today, sess.id, now()
  )
  on conflict (session_id, question_id) do nothing
  returning answer_key into inserted;

  if inserted is null then
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'correct', false,
      'points', 0,
      'serverNow', now()
    );
  end if;

  if awarded > 0 then
    perform public.pulse_credit(
      uid,
      'trivia',
      sess.id || ':' || p_question_id,
      awarded,
      jsonb_build_object(
        'questionId', p_question_id,
        'sessionId', sess.id,
        'difficulty', sess.difficulty,
        'publishDate', today::text,
        'earnedOn', today::text
      )
    );
  end if;

  select count(*) into remaining
  from jsonb_array_elements_text(sess.question_ids) item(id)
  where not exists (
    select 1 from public.pulse_trivia_answers a
    where a.session_id = sess.id and a.question_id = item.id
  );

  if remaining = 0 and sess.completed_at is null then
    update public.pulse_trivia_sessions
    set completed_at = now(),
        available_at = now() + interval '4 hours'
    where id = sess.id
    returning available_at into sess.available_at;
    sess.completed_at := now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'correct', is_correct,
    'points', awarded,
    'correctOption', question.correct_option,
    'explanation', coalesce(question.explanation, ''),
    'completed', remaining = 0,
    'availableAt', sess.available_at,
    'serverNow', now()
  );
end;
$$;

drop function if exists public.pulse_trivia_answer(text, text, text);

grant execute on function public.pulse_trivia_status(text) to anon, authenticated;
grant execute on function public.pulse_trivia_start(text, text) to anon, authenticated;
grant execute on function public.pulse_trivia_answer(text, text, text, text) to anon, authenticated;
