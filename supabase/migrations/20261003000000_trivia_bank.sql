-- ─────────────────────────────────────────────────────────────────────────────
-- Trivia bank: 18 preguntas + RPCs actualizados para selección diaria de 2
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Actualizar pulse_trivia_today: devuelve 2 preguntas/día (mismas
--         para todos los usuarios, selección determinística por fecha). ────────
create or replace function public.pulse_trivia_today(
  p_token text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id text;
  v_today   date;
  v_questions jsonb;
begin
  v_user_id := public.pulse_user_id(p_token);
  v_today   := (now() at time zone 'America/Caracas')::date;

  -- Selecciona 2 preguntas activas del banco, mismo par para todos los usuarios
  -- ese día, usando MD5(id || fecha) como clave de ordenación determinística.
  select jsonb_agg(q_row)
  into   v_questions
  from (
    select jsonb_build_object(
        'id',          q.id,
        'prompt',      q.prompt,
        'options',     q.options,
        'category',    q.category,
        'difficulty',  q.difficulty,
        'points',      q.points,
        'publishDate', v_today::text,
        'answered', exists(
          select 1
          from   public.pulse_trivia_answers a
          where  a.question_id = q.id
            and  a.user_id     = v_user_id
            and  a.publish_date = v_today
        )
      ) as q_row
    from   public.pulse_trivia_questions q
    where  q.status = 'active'
    order  by md5(q.id || v_today::text)
    limit  2
  ) sub;

  if v_questions is null or jsonb_array_length(v_questions) = 0 then
    return jsonb_build_object(
      'ok', true,
      'questions', '[]'::jsonb,
      'message',  'Hoy no hay trivia disponible.'
    );
  end if;

  return jsonb_build_object('ok', true, 'questions', v_questions);
end;
$$;

-- ─── 2. Actualizar pulse_trivia_answer: admite preguntas del banco
--         (publish_date puede ser NULL en la pregunta). ────────────────────────
create or replace function public.pulse_trivia_answer(
  p_token       text,
  p_question_id text,
  p_option_id   text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id   text;
  v_today     date;
  v_question  public.pulse_trivia_questions%rowtype;
  v_is_correct boolean;
  v_points     integer;
  v_already    boolean;
begin
  v_user_id := public.pulse_user_id(p_token);
  v_today   := (now() at time zone 'America/Caracas')::date;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;

  -- La pregunta debe estar activa (sin requerir publish_date = hoy)
  select * into v_question
  from   public.pulse_trivia_questions
  where  id = p_question_id
    and  status = 'active';

  if v_question is null then
    return jsonb_build_object('ok', false, 'error', 'Pregunta no disponible.');
  end if;

  -- Cada usuario puede responder la misma pregunta solo una vez por día
  select exists(
    select 1 from public.pulse_trivia_answers
    where  question_id = p_question_id
      and  user_id     = v_user_id
      and  publish_date = v_today
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', false, 'error', 'Ya respondiste esta pregunta hoy.');
  end if;

  v_is_correct := v_question.correct_option = p_option_id;
  v_points     := case when v_is_correct then v_question.points else 0 end;

  insert into public.pulse_trivia_answers
    (question_id, user_id, option_id, is_correct, points, publish_date)
  values
    (p_question_id, v_user_id, p_option_id, v_is_correct, v_points, v_today);

  if v_points > 0 then
    perform public.pulse_credit(
      v_user_id, 'trivia', p_question_id || '_' || v_today::text,
      v_points,
      jsonb_build_object('questionId', p_question_id, 'publishDate', v_today::text)
    );
  end if;

  return jsonb_build_object(
    'ok',            true,
    'correct',       v_is_correct,
    'points',        v_points,
    'correctOption', v_question.correct_option,
    'explanation',   coalesce(v_question.explanation, '')
  );
end;
$$;

grant execute on function public.pulse_trivia_today(text)             to anon, authenticated;
grant execute on function public.pulse_trivia_answer(text, text, text) to anon, authenticated;

-- ─── 3. Banco inicial: 18 preguntas de béisbol / LVBP ────────────────────────

insert into public.pulse_trivia_questions
  (id, prompt, options, correct_option, explanation, category, difficulty, status, publish_date, points, created_by)
values

-- 1
( gen_random_uuid()::text,
  '¿Cuántos outs conforman una entrada completa (ambos equipos)?',
  '[{"id":"a","label":"3"},{"id":"b","label":"6"},{"id":"c","label":"9"},{"id":"d","label":"12"}]',
  'b',
  'Cada equipo tiene 3 outs por mitad de entrada; 3+3 = 6 en total.',
  'Reglas', 'fácil', 'active', null, 5, null ),

-- 2
( gen_random_uuid()::text,
  '¿Cuántas bolas (balls) necesita acumular un bateador para avanzar a primera base?',
  '[{"id":"a","label":"3"},{"id":"b","label":"4"},{"id":"c","label":"5"},{"id":"d","label":"6"}]',
  'b',
  'Con 4 bolas el bateador recibe "boleto" y avanza a primera base.',
  'Reglas', 'fácil', 'active', null, 5, null ),

-- 3
( gen_random_uuid()::text,
  '¿Cuántos strikes poncha a un bateador?',
  '[{"id":"a","label":"2"},{"id":"b","label":"3"},{"id":"c","label":"4"},{"id":"d","label":"5"}]',
  'b',
  'Tres strikes consecutivos sin contacto válido = ponche.',
  'Reglas', 'fácil', 'active', null, 5, null ),

-- 4
( gen_random_uuid()::text,
  '¿Cuántos jugadores defienden en el campo al mismo tiempo?',
  '[{"id":"a","label":"7"},{"id":"b","label":"8"},{"id":"c","label":"9"},{"id":"d","label":"10"}]',
  'c',
  'El equipo defensivo siempre tiene 9 jugadores posicionados.',
  'Reglas', 'fácil', 'active', null, 5, null ),

-- 5
( gen_random_uuid()::text,
  '¿Cuántas entradas tiene un juego de béisbol regular?',
  '[{"id":"a","label":"7"},{"id":"b","label":"8"},{"id":"c","label":"9"},{"id":"d","label":"11"}]',
  'c',
  'El juego oficial consta de 9 entradas completas.',
  'Reglas', 'fácil', 'active', null, 5, null ),

-- 6
( gen_random_uuid()::text,
  '¿En qué ciudad juegan los Navegantes del Magallanes?',
  '[{"id":"a","label":"Maracaibo"},{"id":"b","label":"Caracas"},{"id":"c","label":"Valencia"},{"id":"d","label":"Barquisimeto"}]',
  'c',
  'Magallanes tiene su sede en Valencia, estado Carabobo.',
  'LVBP', 'fácil', 'active', null, 5, null ),

-- 7
( gen_random_uuid()::text,
  '¿Cuál es el equipo con más títulos en la historia de la LVBP?',
  '[{"id":"a","label":"Leones del Caracas"},{"id":"b","label":"Navegantes del Magallanes"},{"id":"c","label":"Tiburones de La Guaira"},{"id":"d","label":"Águilas del Zulia"}]',
  'a',
  'Los Leones del Caracas son el equipo más ganador de la LVBP.',
  'LVBP', 'fácil', 'active', null, 5, null ),

-- 8
( gen_random_uuid()::text,
  '¿Cómo se llama el jonrón con las bases llenas?',
  '[{"id":"a","label":"Triple play"},{"id":"b","label":"Grand Slam"},{"id":"c","label":"Home run clásico"},{"id":"d","label":"Ciclo"}]',
  'b',
  'Un jonrón con corredores en primera, segunda y tercera base es un Grand Slam y vale 4 carreras.',
  'Reglas', 'medio', 'active', null, 5, null ),

-- 9
( gen_random_uuid()::text,
  '¿Cuántas bases tiene el diamante de béisbol incluyendo el home plate?',
  '[{"id":"a","label":"3"},{"id":"b","label":"4"},{"id":"c","label":"5"},{"id":"d","label":"6"}]',
  'b',
  'Primera, segunda, tercera y home plate: 4 bases en total.',
  'Reglas', 'fácil', 'active', null, 5, null ),

-- 10
( gen_random_uuid()::text,
  '¿Qué posición usa el número "1" en la numeración defensiva del béisbol?',
  '[{"id":"a","label":"Catcher"},{"id":"b","label":"Pitcher (lanzador)"},{"id":"c","label":"Primera base"},{"id":"d","label":"Shortstop"}]',
  'b',
  'En la numeración estándar del béisbol, el pitcher es el jugador #1.',
  'Reglas', 'medio', 'active', null, 5, null ),

-- 11
( gen_random_uuid()::text,
  '¿Qué es un "doble play"?',
  '[{"id":"a","label":"Dos jonrones seguidos"},{"id":"b","label":"Dos outs en la misma jugada"},{"id":"c","label":"Dos carreras en una entrada"},{"id":"d","label":"Dos strikes al mismo bateador"}]',
  'b',
  'El doble play (o doble matanza) retira a dos corredores o bateadores en una sola jugada continua.',
  'Reglas', 'fácil', 'active', null, 5, null ),

-- 12
( gen_random_uuid()::text,
  '¿En qué estado de Venezuela juegan los Tigres de Aragua?',
  '[{"id":"a","label":"Zulia"},{"id":"b","label":"Aragua"},{"id":"c","label":"Miranda"},{"id":"d","label":"Carabobo"}]',
  'b',
  'Los Tigres de Aragua tienen su sede en Maracay, estado Aragua.',
  'LVBP', 'fácil', 'active', null, 5, null ),

-- 13
( gen_random_uuid()::text,
  '¿Qué significa "ERA" en las estadísticas de béisbol?',
  '[{"id":"a","label":"Promedio de carreras limpias por 9 entradas"},{"id":"b","label":"Número de ponches del lanzador"},{"id":"c","label":"Promedio de bateo"},{"id":"d","label":"Partidos ganados"}]',
  'a',
  'ERA (Earned Run Average) es el promedio de carreras limpias que permite un lanzador cada 9 entradas.',
  'Estadísticas', 'medio', 'active', null, 5, null ),

-- 14
( gen_random_uuid()::text,
  '¿Qué equipo LVBP tiene el apodo "La Tribu"?',
  '[{"id":"a","label":"Cardenales de Lara"},{"id":"b","label":"Indios de Occidente"},{"id":"c","label":"Bravos de Margarita"},{"id":"d","label":"Leones del Caracas"}]',
  'b',
  'Los Indios de Occidente de Barquisimeto son conocidos como "La Tribu".',
  'LVBP', 'medio', 'active', null, 5, null ),

-- 15
( gen_random_uuid()::text,
  '¿Qué significa que un lanzador logra un "no-hitter"?',
  '[{"id":"a","label":"Ponchó a todos los bateadores"},{"id":"b","label":"No permitió ningún hit en el juego"},{"id":"c","label":"Lanzó las 9 entradas sin reemplazos"},{"id":"d","label":"No concedió ninguna base por bolas"}]',
  'b',
  'Un no-hitter significa que el lanzador terminó el juego sin permitir ningún hit al equipo contrario.',
  'Reglas', 'medio', 'active', null, 5, null ),

-- 16
( gen_random_uuid()::text,
  '¿Cuál es el nombre oficial del estadio de los Leones del Caracas?',
  '[{"id":"a","label":"Estadio Olímpico de la UCV"},{"id":"b","label":"Estadio Universitario de Caracas"},{"id":"c","label":"Estadio Nacional Brígido Iriarte"},{"id":"d","label":"Estadio La Rinconada"}]',
  'b',
  'El Estadio Universitario de Caracas, en la Ciudad Universitaria de la UCV, es la casa de los Leones.',
  'LVBP', 'medio', 'active', null, 5, null ),

-- 17
( gen_random_uuid()::text,
  '¿Qué equipo lleva los colores negro y amarillo en la LVBP?',
  '[{"id":"a","label":"Tiburones de La Guaira"},{"id":"b","label":"Navegantes del Magallanes"},{"id":"c","label":"Águilas del Zulia"},{"id":"d","label":"Cardenales de Lara"}]',
  'c',
  'Las Águilas del Zulia usan los colores negro y amarillo (dorado).',
  'LVBP', 'medio', 'active', null, 5, null ),

-- 18
( gen_random_uuid()::text,
  '¿Cuántos jugadores pueden estar en las bases simultáneamente como máximo?',
  '[{"id":"a","label":"2"},{"id":"b","label":"3"},{"id":"c","label":"4"},{"id":"d","label":"5"}]',
  'b',
  'Hay tres bases (1ª, 2ª, 3ª) y solo puede haber un corredor en cada una: máximo 3 simultáneos.',
  'Reglas', 'fácil', 'active', null, 5, null );
