create or replace function public.pulse_demo_bonus(p_hits integer)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_hits, 0) >= 12 then 20
    when coalesce(p_hits, 0) >= 10 then 15
    when coalesce(p_hits, 0) >= 7 then 10
    else 0
  end;
$$;

create or replace function public.pulse_demo_settle(p_session_id text)
returns public.pulse_demo_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.pulse_demo_sessions;
  question jsonb;
  chosen text;
  hits integer := 0;
  answered integer := 0;
  bonus integer := 0;
begin
  select * into session from public.pulse_demo_sessions where id = p_session_id for update;
  if session.id is null then
    return session;
  end if;
  if session.status = 'finished' or now() < session.started_at + interval '18 minutes' then
    return session;
  end if;

  for question in select value from jsonb_array_elements(session.script->'questions') loop
    select option_id into chosen
    from public.pulse_demo_answers
    where session_id = session.id and question_id = question->>'id';
    if chosen is not null then
      answered := answered + 1;
      if chosen = question->>'correct' then
        hits := hits + 1;
      end if;
    end if;
    chosen := null;
  end loop;

  bonus := public.pulse_demo_bonus(hits);
  perform public.pulse_credit(
    session.user_id,
    'experience_bonus',
    'demo_bonus:' || session.id,
    bonus,
    jsonb_build_object(
      'kind', 'simulator_bonus',
      'label', 'SIMULATOR EXPERIENCE BONUS',
      'matchId', session.match_id,
      'simulation', true,
      'hits', hits
    )
  );
  update public.pulse_demo_sessions
  set status = 'finished',
      finished_at = now(),
      hits = hits,
      answered = answered,
      bonus = bonus
  where id = session.id
  returning * into session;

  perform public.pulse_log_event('simulator_finished', session.user_id, null, 'sim_finish:' || session.id, jsonb_build_object('matchId', session.match_id, 'hits', hits));
  if bonus > 0 then
    perform public.pulse_log_event('simulator_bonus_awarded', session.user_id, null, 'sim_bonus:' || session.id, jsonb_build_object('matchId', session.match_id, 'points', bonus, 'hits', hits));
  end if;
  return session;
end;
$$;

create or replace function public.pulse_demo_view(p_session public.pulse_demo_sessions)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  elapsed integer;
  question jsonb;
  item jsonb;
  mine text;
  revealed boolean;
  questions jsonb := '[]'::jsonb;
  hits integer := 0;
  events jsonb;
begin
  if p_session.id is null then
    return jsonb_build_object('ok', true, 'status', 'none');
  end if;
  elapsed := greatest(0, floor(extract(epoch from (now() - p_session.started_at)) * 1000))::integer;
  select coalesce(jsonb_agg(ev order by (ev->>'atMs')::int), '[]'::jsonb)
    into events
  from jsonb_array_elements(p_session.script->'events') ev
  where p_session.status = 'finished' or (ev->>'atMs')::int <= elapsed;

  for question in select value from jsonb_array_elements(p_session.script->'questions') loop
    select option_id into mine
    from public.pulse_demo_answers
    where session_id = p_session.id and question_id = question->>'id';
    revealed := now() >= p_session.started_at + ((question->>'resolveMs')::int * interval '1 millisecond');
    item := jsonb_build_object(
      'id', question->>'id',
      'atMs', (question->>'atMs')::int,
      'resolveMs', (question->>'resolveMs')::int,
      'prompt', question->>'prompt',
      'options', question->'options',
      'tone', coalesce(question->>'tone', 'main'),
      'myOption', mine
    );
    if revealed then
      item := item || jsonb_build_object('revealed', true, 'hit', coalesce(mine = question->>'correct', false));
      if mine is not null and mine = question->>'correct' then
        hits := hits + 1;
      end if;
    else
      item := item || jsonb_build_object('revealed', false);
    end if;
    questions := questions || jsonb_build_array(item);
    mine := null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', p_session.status,
    'label', 'SIMULACIÓN',
    'startedAt', p_session.started_at,
    'serverNow', now(),
    'elapsedMs', elapsed,
    'events', events,
    'questions', questions,
    'hits', case when p_session.status = 'finished' then p_session.hits else hits end,
    'questionCount', jsonb_array_length(p_session.script->'questions'),
    'bonus', case when p_session.status = 'finished' then p_session.bonus else 0 end,
    'finalHome', case when p_session.status = 'finished' then (p_session.script->>'finalHome')::int else null end,
    'finalAway', case when p_session.status = 'finished' then (p_session.script->>'finalAway')::int else null end,
    'finished', p_session.status = 'finished'
  );
end;
$$;

create or replace function public.pulse_demo_state(p_token text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  session public.pulse_demo_sessions;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para ver la experiencia.');
  end if;
  select * into session from public.pulse_demo_sessions where match_id = p_match and user_id = uid;
  if session.id is null then
    return jsonb_build_object('ok', true, 'status', 'none');
  end if;
  session := public.pulse_demo_settle(session.id);
  return public.pulse_demo_view(session);
end;
$$;

create or replace function public.pulse_demo_start(p_token text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  session public.pulse_demo_sessions;
  seed text;
  script jsonb;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para jugar.');
  end if;
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null or not match.is_demo then
    return jsonb_build_object('ok', false, 'error', 'Esta experiencia no está disponible.');
  end if;
  if not exists (
    select 1 from public.pulse_match_predictions pred
    where pred.user_id = uid and pred.match_id = match.id and pred.locked_at is null and pred.processed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Primero guarda tu pronóstico.');
  end if;
  select * into session from public.pulse_demo_sessions where match_id = match.id and user_id = uid;
  if session.id is not null then
    session := public.pulse_demo_settle(session.id);
    return public.pulse_demo_view(session);
  end if;

  seed := replace(gen_random_uuid()::text, '-', '');
  script := public.pulse_demo_script(seed, match.away_team, match.home_team);
  insert into public.pulse_demo_sessions (id, match_id, user_id, seed, script)
  values ('demo_' || seed, match.id, uid, seed, script)
  returning * into session;
  perform public.pulse_log_event('simulator_started', uid, null, 'sim_start:' || session.id, jsonb_build_object('matchId', match.id));
  return public.pulse_demo_view(session);
end;
$$;

create or replace function public.pulse_demo_answer(p_token text, p_match text, p_question text, p_option text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  session public.pulse_demo_sessions;
  question jsonb;
  correct text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para responder.');
  end if;
  select * into session from public.pulse_demo_sessions where match_id = p_match and user_id = uid for update;
  if session.id is null or session.status <> 'live' then
    return jsonb_build_object('ok', false, 'error', 'La experiencia no está en juego.');
  end if;
  select value into question
  from jsonb_array_elements(session.script->'questions')
  where value->>'id' = p_question;
  if question is null then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no pertenece a esta experiencia.');
  end if;
  if now() < session.started_at + ((question->>'atMs')::int * interval '1 millisecond') - interval '3 seconds' then
    return jsonb_build_object('ok', false, 'error', 'Ese momento todavía no empieza.');
  end if;
  if now() > session.started_at + ((question->>'resolveMs')::int * interval '1 millisecond') then
    return jsonb_build_object('ok', false, 'error', 'Ese momento ya cerró.');
  end if;
  if not exists (
    select 1 from jsonb_array_elements(question->'options') opt where opt->>'id' = p_option
  ) then
    return jsonb_build_object('ok', false, 'error', 'Elige una de las opciones.');
  end if;
  insert into public.pulse_demo_answers (id, session_id, question_id, option_id)
  values ('dans_' || replace(gen_random_uuid()::text, '-', ''), session.id, p_question, p_option)
  on conflict (session_id, question_id) do nothing;
  correct := question->>'correct';
  perform public.pulse_log_event('simulator_question_answered', uid, null, 'sim_answer:' || session.id || ':' || p_question, jsonb_build_object('matchId', p_match, 'questionId', p_question));
  if correct = p_option then
    perform public.pulse_log_event('simulator_question_correct', uid, null, 'sim_correct:' || session.id || ':' || p_question, jsonb_build_object('matchId', p_match, 'questionId', p_question));
  end if;
  return public.pulse_demo_view(session);
end;
$$;

create or replace function public.pulse_demo_log(p_token text, p_match text, p_type text, p_dedupe text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null or p_type not in ('simulator_inning_started', 'simulator_question_shown', 'prize_viewed') then
    return jsonb_build_object('ok', false);
  end if;
  perform public.pulse_log_event(p_type, uid, null, left(coalesce(p_dedupe, p_type), 180), jsonb_build_object('matchId', p_match));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_matches_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  perform public.pulse_sim_tick();
  perform public.pulse_lock_due_matches();
  uid := public.pulse_user_id(p_token);
  return coalesce((
    select jsonb_agg(row_to_json(item) order by item."startsAt")
    from (
      select
        m.id,
        m.home_team as "homeTeam",
        m.away_team as "awayTeam",
        m.starts_at as "startsAt",
        m.status,
        m.home_score as "homeScore",
        m.away_score as "awayScore",
        m.inning,
        m.half,
        m.outs,
        m.is_featured as featured,
        m.last_event_text as "lastEventText",
        m.is_simulation as simulation,
        m.is_demo as demo,
        (
          select jsonb_build_object(
            'id', p.id,
            'winner', p.predicted_winner,
            'homeScore', p.predicted_home_score,
            'awayScore', p.predicted_away_score,
            'lockedAt', p.locked_at,
            'processed', p.processed_at is not null,
            'winnerPoints', (tx.metadata->>'winnerPoints')::int,
            'closenessPoints', (tx.metadata->>'closenessPoints')::int,
            'total', tx.points,
            'errorTotal', (tx.metadata->>'errorTotal')::int
          )
          from public.pulse_match_predictions p
          left join public.pulse_transactions tx
            on tx.source_type = 'prediction' and tx.source_id = p.id
          where p.match_id = m.id and p.user_id = uid
        ) as prediction
      from public.pulse_matches m
    ) item
  ), '[]'::jsonb);
end;
$$;
