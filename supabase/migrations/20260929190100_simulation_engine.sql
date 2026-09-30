-- ===========================================================================
-- Pulse · Experiencia Juégate el Tobo · motor de experiencia (parte 2)
-- ---------------------------------------------------------------------------
-- Este archivo acompaña a la tabla de escenarios. Define:
--   1. pulse_sim_scenarios_list  -> el cliente recibe el guion, no lo inventa.
--   2. pulse_demo_sessions       -> la sesion guarda el guion usado.
--   3. pulse_demo_start/answer   -> el reloj lo maneja el cliente; el servidor
--                                   solo valida contra el guion guardado.
--   4. pulse_demo_settle         -> paga el bonus de experiencia una sola vez.
--   5. pulse_demo_log            -> whitelist de los eventos analiticos.
--
-- REGLA INNEGOCIABLE: nada de aqui escribe en pulse_matches.home_score,
-- pulse_matches.away_score ni cambia el status de un partido. La simulacion y
-- el resultado oficial son conceptos separados.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Sesiones: ahora guardan el escenario y el guion que realmente se reprodujo.
-- El reloj de la simulacion lo maneja el cliente, asi que la semilla que usaba
-- el generador aleatorio anterior ya no significa nada. Se le da un default
-- para que las filas nuevas no dependan de ella, y se conserva por historico.
-- ---------------------------------------------------------------------------
alter table public.pulse_demo_sessions
  add column if not exists scenario_id text not null default 'cerrado';

update public.pulse_demo_sessions set scenario_id = 'cerrado' where scenario_id is null;

alter table public.pulse_demo_sessions
  alter column seed set default '';

-- ---------------------------------------------------------------------------
-- Limpieza de la version anterior del protocolo. Sin esto quedan vivos dos
-- endpoints viejos, incompatibles con el guion nuevo y accesibles por anon.
-- ---------------------------------------------------------------------------
drop function if exists public.pulse_demo_start(text, text);
drop function if exists public.pulse_demo_bonus(integer);
drop function if exists public.pulse_demo_script(text, text, text);

-- ---------------------------------------------------------------------------
-- Lectura de escenarios para el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.pulse_sim_scenarios_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'description', s.description,
    'tension', s.tension,
    'innings', s.innings,
    'secondsPerInning', s.seconds_per_inning,
    'finalHome', s.final_home,
    'finalAway', s.final_away,
    'script', s.script
  ) order by s.innings, s.name), '[]'::jsonb)
  from public.pulse_sim_scenarios s
  where s.active;
$$;

-- ---------------------------------------------------------------------------
-- Estado de la sesion. El cliente ya tiene el guion, aqui solo le damos
-- lo que el servidor es el unico que sabe: las respuestas ya enviadas.
-- ---------------------------------------------------------------------------
create or replace function public.pulse_demo_view(p_session public.pulse_demo_sessions)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  question jsonb;
  mine text;
  item jsonb;
  answers jsonb := '[]'::jsonb;
begin
  if p_session.id is null then
    return jsonb_build_object('ok', true, 'status', 'none');
  end if;

  for question in select value from jsonb_array_elements(p_session.script->'moments') loop
    select option_id into mine
    from public.pulse_demo_answers
    where session_id = p_session.id and question_id = question->>'id';
    item := jsonb_build_object(
      'id', question->>'id',
      'optionId', mine,
      'bonus', coalesce((question->>'bonus')::int, 0)
    );
    answers := answers || jsonb_build_array(item);
    mine := null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', p_session.status,
    'label', 'SIMULACION',
    'scenarioId', p_session.scenario_id,
    'answers', answers,
    'hits', p_session.hits,
    'answered', p_session.answered,
    'bonus', p_session.bonus,
    'finished', p_session.status = 'finished'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Arranque de la experiencia.
-- ---------------------------------------------------------------------------
create or replace function public.pulse_demo_start(p_token text, p_match text, p_scenario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  scenario public.pulse_sim_scenarios;
  session public.pulse_demo_sessions;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para jugar.');
  end if;

  select * into match from public.pulse_matches where id = p_match;
  if match.id is null or not match.is_demo then
    return jsonb_build_object('ok', false, 'error', 'Esta experiencia no esta disponible.');
  end if;

  select * into scenario from public.pulse_sim_scenarios
  where id = coalesce(nullif(trim(p_scenario), ''), 'cerrado') and active;
  if scenario.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese escenario no esta disponible.');
  end if;

  if not exists (
    select 1 from public.pulse_match_predictions pred
    where pred.user_id = uid and pred.match_id = match.id
      and pred.locked_at is null and pred.processed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Primero guarda tu pronostico.');
  end if;

  select * into session
  from public.pulse_demo_sessions
  where match_id = match.id and user_id = uid
  for update;

  if session.id is not null then
    return public.pulse_demo_view(session);
  end if;

  insert into public.pulse_demo_sessions (id, match_id, user_id, scenario_id, script)
  values (
    'demo_' || replace(gen_random_uuid()::text, '-', ''),
    match.id, uid, scenario.id, scenario.script
  )
  returning * into session;

  perform public.pulse_log_event(
    'simulation_started', uid, null, 'sim_start:' || session.id,
    jsonb_build_object('matchId', match.id, 'scenarioId', scenario.id)
  );

  return public.pulse_demo_view(session);
end;
$$;

-- ---------------------------------------------------------------------------
-- Respuesta a un Momento Pulse.
--
-- El reloj lo maneja el cliente, asi que aqui NO se valida el tiempo: se
-- valida que la pregunta exista en el guion de ESTA sesion y que la opcion
-- sea una de las suyas. El acierto se lee del guion guardado, no del cliente.
-- ---------------------------------------------------------------------------
create or replace function public.pulse_demo_answer(
  p_token text, p_match text, p_question text, p_option text
)
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
  hit boolean;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para responder.');
  end if;

  select * into session
  from public.pulse_demo_sessions
  where match_id = p_match and user_id = uid
  for update;

  if session.id is null then
    return jsonb_build_object('ok', false, 'error', 'Primero empieza la experiencia.');
  end if;
  if session.status <> 'live' then
    return jsonb_build_object('ok', false, 'error', 'La experiencia ya cerro.');
  end if;

  select value into question
  from jsonb_array_elements(session.script->'moments')
  where value->>'id' = p_question;
  if question is null then
    return jsonb_build_object('ok', false, 'error', 'Ese momento no pertenece a esta experiencia.');
  end if;

  if not exists (
    select 1 from jsonb_array_elements(question->'options') opt
    where opt->>'id' = p_option
  ) then
    return jsonb_build_object('ok', false, 'error', 'Elige una de las opciones.');
  end if;

  insert into public.pulse_demo_answers (id, session_id, question_id, option_id)
  values (
    'dans_' || replace(gen_random_uuid()::text, '-', ''), session.id, p_question, p_option
  )
  on conflict (session_id, question_id) do nothing;

  correct := question->>'correct';
  hit := correct = p_option;

  perform public.pulse_log_event(
    'simulation_moment_answered', uid, null,
    'sim_answer:' || session.id || ':' || p_question,
    jsonb_build_object('matchId', p_match, 'momentId', p_question, 'hit', hit)
  );

  return public.pulse_demo_view(session);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cierre y pago del bonus de experiencia.
--
-- Es la UNICA funcion de este archivo que acredita puntos, y acredita solo el
-- bonus de la experiencia. Nunca el pronostico oficial: ese se resuelve con
-- el resultado real del partido, en otro flujo.
-- ---------------------------------------------------------------------------
create or replace function public.pulse_demo_settle(p_session_id text)
returns public.pulse_demo_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.pulse_demo_sessions;
  moment jsonb;
  chosen text;
  correct text;
  v_hits integer := 0;
  v_answered integer := 0;
  v_bonus integer := 0;
begin
  select * into session from public.pulse_demo_sessions where id = p_session_id for update;
  if session.id is null or session.status = 'finished' then
    return session;
  end if;

  for moment in select value from jsonb_array_elements(session.script->'moments') loop
    select option_id into chosen
    from public.pulse_demo_answers
    where session_id = session.id and question_id = moment->>'id';
    if chosen is not null then
      v_answered := v_answered + 1;
      if chosen = moment->>'correct' then
        v_hits := v_hits + 1;
        v_bonus := v_bonus + coalesce((moment->>'bonus')::int, 0);
      end if;
    end if;
    chosen := null;
    correct := null;
  end loop;

  update public.pulse_demo_sessions
  set status = 'finished',
      finished_at = now(),
      hits = v_hits,
      answered = v_answered,
      bonus = v_bonus
  where id = session.id
  returning * into session;

  if v_bonus > 0 then
    perform public.pulse_credit(
      session.user_id,
      'experience_bonus',
      'sim_bonus:' || session.id,
      v_bonus,
      jsonb_build_object(
        'kind', 'simulation_bonus',
        'label', 'PULSE MOMENTS BONUS',
        'matchId', session.match_id,
        'scenarioId', session.scenario_id,
        'simulated', true,
        'hits', v_hits,
        'answered', v_answered
      )
    );
  end if;

  perform public.pulse_log_event(
    'simulation_completed', session.user_id, null, 'sim_finish:' || session.id,
    jsonb_build_object(
      'matchId', session.match_id,
      'scenarioId', session.scenario_id,
      'hits', v_hits,
      'answered', v_answered,
      'bonus', v_bonus
    )
  );

  return session;
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

  select * into session from public.pulse_demo_sessions
  where match_id = p_match and user_id = uid;
  if session.id is null then
    return jsonb_build_object('ok', true, 'status', 'none');
  end if;

  return public.pulse_demo_view(session);
end;
$$;

-- Cierre explicito: el cliente avisa cuando termina la experiencia.
create or replace function public.pulse_demo_finish(p_token text, p_match text)
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
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para cerrar la experiencia.');
  end if;

  select * into session from public.pulse_demo_sessions
  where match_id = p_match and user_id = uid;
  if session.id is null then
    return jsonb_build_object('ok', false, 'error', 'La experiencia no arranco.');
  end if;
  if not public.pulse_demo_duration_ok(session) then
    return jsonb_build_object(
      'ok', false,
      'error', 'La experiencia todavia no cumple el tiempo minimo para cerrarse.'
    );
  end if;

  session := public.pulse_demo_settle(session.id);
  return public.pulse_demo_view(session);
end;
$$;

-- El cliente es dueno del reloj, pero no puede cerrar la experiencia al
-- instante: se exige al menos la mitad de la duracion del guion. Sin esto
-- un cliente modificado podria quemar su sesion antes de jugar.
create or replace function public.pulse_demo_duration_ok(p_session public.pulse_demo_sessions)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  expected integer;
  elapsed integer;
begin
  if p_session.id is null then
    return false;
  end if;
  expected := greatest(60, coalesce((p_session.script->>'secondsPerInning')::int, 120) * 9 / 2);
  elapsed := greatest(0, floor(extract(epoch from (now() - p_session.started_at))));
  return elapsed >= expected;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analitica: whitelist de los eventos de la experiencia.
-- Se reusa pulse_log_event, que es el unico sistema del proyecto.
-- ---------------------------------------------------------------------------
create or replace function public.pulse_demo_log(
  p_token text, p_match text, p_type text, p_dedupe text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  if p_type not in (
    'simulation_started',
    'simulation_inning_started',
    'simulation_inning_completed',
    'simulation_event_triggered',
    'simulation_question_shown',
    'simulation_question_answered',
    'simulation_moment_started',
    'simulation_moment_answered',
    'simulation_completed',
    'simulation_demo_started',
    'simulation_demo_inning_selected',
    'prize_viewed',
    'venue_viewed'
  ) then
    return jsonb_build_object('ok', false);
  end if;

  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false);
  end if;

  perform public.pulse_log_event(
    p_type, uid, null, left(coalesce(p_dedupe, p_type), 180),
    jsonb_build_object('matchId', p_match)
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo Control. Solo para administracion, igual que el resto del area admin.
-- Devuelve el guion y NO escribe nada en la sesion del jugador: una demo no
-- puede tocar puntos, premios ni el resultado oficial.
-- ---------------------------------------------------------------------------
create or replace function public.pulse_admin_sim_preview(p_admin_key text, p_scenario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  scenario public.pulse_sim_scenarios;
begin
  perform public.pulse_require_admin(p_admin_key);

  select * into scenario from public.pulse_sim_scenarios
  where id = coalesce(nullif(trim(p_scenario), ''), 'cerrado') and active;
  if scenario.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese escenario no esta disponible.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'scenarioId', scenario.id,
    'name', scenario.name,
    'description', scenario.description,
    'innings', scenario.innings,
    'secondsPerInning', scenario.seconds_per_inning,
    'finalHome', scenario.final_home,
    'finalAway', scenario.final_away,
    'script', scenario.script
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos.
-- ---------------------------------------------------------------------------
revoke all on function public.pulse_demo_view(public.pulse_demo_sessions) from public, anon, authenticated;
revoke all on function public.pulse_demo_settle(text) from public, anon, authenticated;

grant execute on function public.pulse_sim_scenarios_list() to anon, authenticated;
grant execute on function public.pulse_demo_state(text, text) to anon, authenticated;
grant execute on function public.pulse_demo_start(text, text, text) to anon, authenticated;
grant execute on function public.pulse_demo_answer(text, text, text, text) to anon, authenticated;
grant execute on function public.pulse_demo_finish(text, text) to anon, authenticated;
grant execute on function public.pulse_demo_log(text, text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_sim_preview(text, text) to anon, authenticated;
