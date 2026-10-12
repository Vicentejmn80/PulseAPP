-- Rusher: puntos 2/4/6, banco Iniciado y cronograma LVBP 12 oct–5 nov 2026.
-- Revisable. No aplicar con db push desde este cambio; no borra predicciones ni historial.

-- Banco Iniciado importado de los PDF Principiante. No borra otros niveles.
insert into public.pulse_trivia_questions
  (id, prompt, options, correct_option, explanation, category, difficulty, status, publish_date, points, created_by)
values
  ('trv_ini_p001', '¿En qué ciudad está el estadio Luis Aparicio “El Grande”?', '[{"id":"a","label":"Maracay"},{"id":"b","label":"Barquisimeto"},{"id":"c","label":"Valencia"},{"id":"d","label":"Maracaibo"}]'::jsonb, 'd', null, 'Estadios', 'easy', 'active', null, 2, null),
  ('trv_ini_p002', '¿Cuál es la ciudad sede de los Tigres de Aragua?', '[{"id":"a","label":"Caracas"},{"id":"b","label":"Maracay"},{"id":"c","label":"Puerto La Cruz"},{"id":"d","label":"Valencia"}]'::jsonb, 'b', null, 'Equipos', 'easy', 'active', null, 2, null),
  ('trv_ini_p003', '¿Qué equipo de la LVBP representa a la isla de Margarita?', '[{"id":"a","label":"Bravos"},{"id":"b","label":"Tiburones"},{"id":"c","label":"Navegantes"},{"id":"d","label":"Caribes"}]'::jsonb, 'a', null, 'Equipos', 'easy', 'active', null, 2, null),
  ('trv_ini_p004', '¿En qué ciudad tiene su sede Cardenales de Lara?', '[{"id":"a","label":"Maracay"},{"id":"b","label":"Barquisimeto"},{"id":"c","label":"Maracaibo"},{"id":"d","label":"Acarigua"}]'::jsonb, 'b', null, 'Equipos', 'easy', 'active', null, 2, null),
  ('trv_ini_p005', '¿En qué ciudad está el estadio Alfonso “Chico” Carrasquel?', '[{"id":"a","label":"Puerto La Cruz"},{"id":"b","label":"Maturín"},{"id":"c","label":"Cumaná"},{"id":"d","label":"Ciudad Bolívar"}]'::jsonb, 'a', null, 'Estadios', 'easy', 'active', null, 2, null),
  ('trv_ini_p006', '¿Qué significan las siglas LVBP?', '[{"id":"a","label":"Liga Venezolana de Béisbol Pelota"},{"id":"b","label":"y Liga Venezolana de Béisbol Provincial"},{"id":"c","label":"Liga Venezolana de Béisbol Profesional"},{"id":"d","label":"Liga de Verano de Béisbol Profesional"}]'::jsonb, 'c', null, 'Liga', 'easy', 'active', null, 2, null),
  ('trv_ini_p007', '¿Qué venezolano es conocido como “El Gato”?', '[{"id":"a","label":"David Concepción"},{"id":"b","label":"Bob Abreu"},{"id":"c","label":"Andrés Galarraga"},{"id":"d","label":"Antonio Armas"}]'::jsonb, 'c', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p008', '¿Qué lanzador venezolano es conocido como “El Rey”?', '[{"id":"a","label":"Freddy García"},{"id":"b","label":"Johan Santana"},{"id":"c","label":"Carlos Zambrano"},{"id":"d","label":"Félix Hernández"}]'::jsonb, 'd', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p009', '¿Cuál es la posición por la que se reconoce principalmente a Salvador Pérez?', '[{"id":"a","label":"Lanzador"},{"id":"b","label":"Campocorto"},{"id":"c","label":"Receptor"},{"id":"d","label":"Jardinero central"}]'::jsonb, 'c', null, 'Jugadores', 'easy', 'active', null, 2, null),
  ('trv_ini_p010', '¿Quién fue el primer venezolano exaltado a Cooperstown?', '[{"id":"a","label":"Antonio Armas"},{"id":"b","label":"David Concepción"},{"id":"c","label":"Andrés Galarraga"},{"id":"d","label":"Luis Aparicio"}]'::jsonb, 'd', null, 'Venezolanos en MLB', 'easy', 'active', null, 2, null),
  ('trv_ini_p011', '¿Qué equipo de la LVBP lleva el nombre de la capital venezolana?', '[{"id":"a","label":"Leones del Caracas"},{"id":"b","label":"Cardenales de Lara"},{"id":"c","label":"Bravos de Margarita"},{"id":"d","label":"Tigres de Aragua"}]'::jsonb, 'a', null, 'Equipos', 'easy', 'active', null, 2, null),
  ('trv_ini_p012', '¿Qué ciudad se convirtió en sede de Magallanes en 1969?', '[{"id":"a","label":"Valencia"},{"id":"b","label":"Maracay"},{"id":"c","label":"Barquisimeto"},{"id":"d","label":"Maracaibo"}]'::jsonb, 'a', null, 'Equipos', 'easy', 'active', null, 2, null),
  ('trv_ini_p013', '¿Qué equipo de la LVBP representa a La Guaira?', '[{"id":"a","label":"Águilas"},{"id":"b","label":"Tiburones"},{"id":"c","label":"Tigres"},{"id":"d","label":"Cardenales"}]'::jsonb, 'b', null, 'Equipos', 'easy', 'active', null, 2, null),
  ('trv_ini_p014', '¿A qué equipo se le llama “los pájaros rojos”?', '[{"id":"a","label":"Cardenales de Lara"},{"id":"b","label":"Caribes de Anzoátegui"},{"id":"c","label":"Tiburones de La Guaira"},{"id":"d","label":"Águilas del Zulia"}]'::jsonb, 'a', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p015', '¿Qué equipo de la LVBP es conocido como “La Tribu”?', '[{"id":"a","label":"Navegantes del Magallanes"},{"id":"b","label":"Caribes de Anzoátegui"},{"id":"c","label":"Tigres de Aragua"},{"id":"d","label":"Bravos de Margarita"}]'::jsonb, 'b', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p016', '¿Qué equipo de la LVBP es conocido como “los bengalíes”?', '[{"id":"a","label":"Tiburones de La Guaira"},{"id":"b","label":"Tigres de Aragua"},{"id":"c","label":"Águilas del Zulia"},{"id":"d","label":"Leones del Caracas"}]'::jsonb, 'b', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p017', '¿A qué equipo de la LVBP se le llama “los melenudos”?', '[{"id":"a","label":"Caribes de Anzoátegui"},{"id":"b","label":"Cardenales de Lara"},{"id":"c","label":"Navegantes del Magallanes"},{"id":"d","label":"Leones del Caracas"}]'::jsonb, 'd', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p018', '¿Con qué equipo venezolano comenzó Miguel Cabrera su carrera profesional?', '[{"id":"a","label":"Tigres de Aragua"},{"id":"b","label":"Águilas del Zulia"},{"id":"c","label":"Leones del Caracas"},{"id":"d","label":"Cardenales de Lara"}]'::jsonb, 'a', null, 'Jugadores', 'easy', 'active', null, 2, null),
  ('trv_ini_p019', '¿Con qué equipo de la LVBP se identifica la trayectoria de David Concepción?', '[{"id":"a","label":"Tigres de Aragua"},{"id":"b","label":"Caribes de Anzoátegui"},{"id":"c","label":"Cardenales de Lara"},{"id":"d","label":"Bravos de Margarita"}]'::jsonb, 'a', null, 'Jugadores', 'easy', 'active', null, 2, null),
  ('trv_ini_p020', '¿Con qué club de la LVBP jugó Robert Pérez sus 27 temporadas?', '[{"id":"a","label":"Leones del Caracas"},{"id":"b","label":"Águilas del Zulia"},{"id":"c","label":"Cardenales de Lara"},{"id":"d","label":"Tigres de Aragua"}]'::jsonb, 'c', null, 'Jugadores', 'easy', 'active', null, 2, null),
  ('trv_ini_p021', '¿Cuántos outs terminan el turno ofensivo de un equipo en una entrada?', '[{"id":"a","label":"Dos"},{"id":"b","label":"Cinco"},{"id":"c","label":"Tres"},{"id":"d","label":"Cuatro"}]'::jsonb, 'c', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p022', '¿Cuántas bolas en la cuenta conceden una base por bolas?', '[{"id":"a","label":"Tres"},{"id":"b","label":"Cinco"},{"id":"c","label":"Dos"},{"id":"d","label":"Cuatro"}]'::jsonb, 'd', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p023', '¿Cuántos jugadores coloca un equipo a la defensiva?', '[{"id":"a","label":"Nueve"},{"id":"b","label":"Once"},{"id":"c","label":"Diez"},{"id":"d","label":"Ocho"}]'::jsonb, 'a', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p024', '¿Cuántas entradas tiene un juego estándar, sin acortamientos ni extrainnings?', '[{"id":"a","label":"Siete"},{"id":"b","label":"Nueve"},{"id":"c","label":"Diez"},{"id":"d","label":"Ocho"}]'::jsonb, 'b', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p025', '¿Cuántas bases hay en el diamante, contando el home?', '[{"id":"a","label":"Tres"},{"id":"b","label":"Cinco"},{"id":"c","label":"Seis"},{"id":"d","label":"Cuatro"}]'::jsonb, 'd', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p026', '¿Qué equipo batea en la parte alta de una entrada?', '[{"id":"a","label":"El que va ganando"},{"id":"b","label":"El local"},{"id":"c","label":"El visitante"},{"id":"d","label":"El que va perdiendo"}]'::jsonb, 'c', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p027', 'Un defensor atrapa legalmente un elevado antes del bote. ¿Qué ocurre con el bateador?', '[{"id":"a","label":"Recibe una base"},{"id":"b","label":"Es out"},{"id":"c","label":"Batea de nuevo"},{"id":"d","label":"Anota una carrera"}]'::jsonb, 'b', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p028', '¿Qué significa tener las bases llenas?', '[{"id":"a","label":"Hay dos corredores en home"},{"id":"b","label":"Hay tres outs"},{"id":"c","label":"Hay corredores en primera, segunda y tercera"},{"id":"d","label":"Todos los defensores están en una base"}]'::jsonb, 'c', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p029', '¿Cuántas carreras produce un grand slam válido?', '[{"id":"a","label":"Una"},{"id":"b","label":"Tres"},{"id":"c","label":"Dos"},{"id":"d","label":"Cuatro"}]'::jsonb, 'd', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p030', '¿Cuántos outs consigue la defensa en un doble play?', '[{"id":"a","label":"Cuatro"},{"id":"b","label":"Dos"},{"id":"c","label":"Tres"},{"id":"d","label":"Uno"}]'::jsonb, 'b', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p061', '¿En qué posición destacó Jesús Marcano Trillo?', '[{"id":"a","label":"Receptor"},{"id":"b","label":"Jardinero central"},{"id":"c","label":"Lanzador"},{"id":"d","label":"Segunda base"}]'::jsonb, 'd', null, 'Figuras venezolanas', 'easy', 'active', null, 2, null),
  ('trv_ini_p062', '¿En qué localidad de Anzoátegui nació Antonio Armas?', '[{"id":"a","label":"El Tigre"},{"id":"b","label":"Puerto Píritu"},{"id":"c","label":"Anaco"},{"id":"d","label":"Cantaura"}]'::jsonb, 'b', null, 'Geografía del béisbol', 'easy', 'active', null, 2, null),
  ('trv_ini_p063', '¿En qué localidad mirandina nació Oswaldo Guillén?', '[{"id":"a","label":"Ocumare del Tuy"},{"id":"b","label":"Guarenas"},{"id":"c","label":"Higuerote"},{"id":"d","label":"Los Teques"}]'::jsonb, 'a', null, 'Geografía del béisbol', 'easy', 'active', null, 2, null),
  ('trv_ini_p064', '¿Cuál era el nombre de «Chico» Carrasquel?', '[{"id":"a","label":"Alfredo"},{"id":"b","label":"Alfonso"},{"id":"c","label":"Antonio"},{"id":"d","label":"Alejandro"}]'::jsonb, 'b', null, 'Figuras venezolanas', 'easy', 'active', null, 2, null),
  ('trv_ini_p065', '¿Qué posición ocupaba Baudilio Díaz?', '[{"id":"a","label":"Receptor"},{"id":"b","label":"Jardinero central"},{"id":"c","label":"Campocorto"},{"id":"d","label":"Segunda base"}]'::jsonb, 'a', null, 'Figuras venezolanas', 'easy', 'active', null, 2, null),
  ('trv_ini_p066', 'En el juego venezolano de «chapitas», ¿qué se batea?', '[{"id":"a","label":"Una bola de papel"},{"id":"b","label":"Una pelota de tenis"},{"id":"c","label":"Una tapa metálica de botella"},{"id":"d","label":"Una moneda"}]'::jsonb, 'c', null, 'Cultura beisbolera', 'easy', 'active', null, 2, null),
  ('trv_ini_p067', '¿En qué posición defensiva destacó Omar Vizquel?', '[{"id":"a","label":"Primera base"},{"id":"b","label":"Lanzador"},{"id":"c","label":"Campocorto"},{"id":"d","label":"Receptor"}]'::jsonb, 'c', null, 'Figuras venezolanas', 'easy', 'active', null, 2, null),
  ('trv_ini_p068', '¿Con qué equipo debutó Edgardo Alfonzo en la LVBP?', '[{"id":"a","label":"Tiburones de La Guaira"},{"id":"b","label":"Leones del Caracas"},{"id":"c","label":"Cardenales de Lara"},{"id":"d","label":"Navegantes del Magallanes"}]'::jsonb, 'd', null, 'Trayectorias LVBP', 'easy', 'active', null, 2, null),
  ('trv_ini_p069', '¿En qué equipo destacó Melvin Mora durante la década de 2000?', '[{"id":"a","label":"Padres de San Diego"},{"id":"b","label":"Cachorros de Chicago"},{"id":"c","label":"Orioles de Baltimore"},{"id":"d","label":"Reales de Kansas City"}]'::jsonb, 'c', null, 'Venezolanos en MLB', 'easy', 'active', null, 2, null),
  ('trv_ini_p070', '¿A qué equipo de Detroit perteneció Carlos Guillén?', '[{"id":"a","label":"Marineros"},{"id":"b","label":"Mellizos"},{"id":"c","label":"Piratas"},{"id":"d","label":"Tigres"}]'::jsonb, 'd', null, 'Venezolanos en MLB', 'easy', 'active', null, 2, null),
  ('trv_ini_p071', '¿Quién es «Balbineitor» en la LVBP?', '[{"id":"a","label":"Balbino Fuenmayor"},{"id":"b","label":"Renato Núñez"},{"id":"c","label":"Jesús Aguilar"},{"id":"d","label":"Luis Jiménez"}]'::jsonb, 'a', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p072', '¿Qué lanzador venezolano es conocido como «El Torpedo»?', '[{"id":"a","label":"Freddy García"},{"id":"b","label":"Félix Doubront"},{"id":"c","label":"Ramón Ramírez"},{"id":"d","label":"Ricardo Pinto"}]'::jsonb, 'a', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p073', '¿A qué jugador de Cardenales llaman «Caripito»?', '[{"id":"a","label":"Luis Sojo"},{"id":"b","label":"Ildemaro Vargas"},{"id":"c","label":"Robert Pérez"},{"id":"d","label":"César Izturis"}]'::jsonb, 'b', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p074', '¿Qué jardinero venezolano usa el apodo «The Hunter»?', '[{"id":"a","label":"Gorkys Hernández"},{"id":"b","label":"Endy Chávez"},{"id":"c","label":"Ezequiel Carrera"},{"id":"d","label":"Gregor Blanco"}]'::jsonb, 'a', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p075', '¿En qué zona defensiva jugaba principalmente Antonio Armas?', '[{"id":"a","label":"La receptoría"},{"id":"b","label":"Los jardines"},{"id":"c","label":"El campocorto"},{"id":"d","label":"La lomita"}]'::jsonb, 'b', null, 'Figuras venezolanas', 'easy', 'active', null, 2, null),
  ('trv_ini_p076', '¿Qué venezolano es conocido como «El Indio» Trillo?', '[{"id":"a","label":"Manny Ramírez"},{"id":"b","label":"Jesús Marcano Trillo"},{"id":"c","label":"Manny Machado"},{"id":"d","label":"Manny Sanguillén"}]'::jsonb, 'b', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p077', '¿Con qué equipo de la LVBP jugó Baudilio Díaz?', '[{"id":"a","label":"Cardenales de Lara"},{"id":"b","label":"Bravos de Margarita"},{"id":"c","label":"Caribes de Anzoátegui"},{"id":"d","label":"Leones del Caracas"}]'::jsonb, 'd', null, 'Trayectorias LVBP', 'easy', 'active', null, 2, null),
  ('trv_ini_p078', '¿Con qué equipo ganó Luis Sojo las Series Mundiales de 1996, 1998, 1999 y 2000?', '[{"id":"a","label":"Yankees de Nueva York"},{"id":"b","label":"Angelinos de California"},{"id":"c","label":"Mets de Nueva York"},{"id":"d","label":"Marineros de Seattle"}]'::jsonb, 'a', null, 'Venezolanos en MLB', 'easy', 'active', null, 2, null),
  ('trv_ini_p079', '¿Qué equipo venezolano tuvo a Omar Vizquel como campocorto?', '[{"id":"a","label":"Leones del Caracas"},{"id":"b","label":"Caribes de Anzoátegui"},{"id":"c","label":"Bravos de Margarita"},{"id":"d","label":"Tigres de Aragua"}]'::jsonb, 'a', null, 'Trayectorias LVBP', 'easy', 'active', null, 2, null),
  ('trv_ini_p080', '¿Qué venezolano recibió el apodo «Fonzie» en los Mets?', '[{"id":"a","label":"Wilmer Flores"},{"id":"b","label":"Francisco Álvarez"},{"id":"c","label":"Edgardo Alfonzo"},{"id":"d","label":"Luis Guillorme"}]'::jsonb, 'c', null, 'Apodos', 'easy', 'active', null, 2, null),
  ('trv_ini_p081', '¿Qué pelotero venezolano nació en Agua Negra?', '[{"id":"a","label":"Magglio Ordóñez"},{"id":"b","label":"Bob Abreu"},{"id":"c","label":"Melvin Mora"},{"id":"d","label":"Carlos Guillén"}]'::jsonb, 'c', null, 'Geografía del béisbol', 'easy', 'active', null, 2, null),
  ('trv_ini_p082', '¿Qué función cumplía Freddy García en el terreno?', '[{"id":"a","label":"Primera base"},{"id":"b","label":"Jardinero derecho"},{"id":"c","label":"Receptor"},{"id":"d","label":"Lanzador"}]'::jsonb, 'd', null, 'Figuras venezolanas', 'easy', 'active', null, 2, null),
  ('trv_ini_p083', '¿En qué localidad de Monagas nació Jesús Marcano Trillo?', '[{"id":"a","label":"Caripito"},{"id":"b","label":"Temblador"},{"id":"c","label":"Caripe"},{"id":"d","label":"Punta de Mata"}]'::jsonb, 'a', null, 'Geografía del béisbol', 'easy', 'active', null, 2, null),
  ('trv_ini_p084', '¿Qué equipos protagonizan el clásico Caracas–Magallanes?', '[{"id":"a","label":"Tiburones y Tigres"},{"id":"b","label":"Leones y Navegantes"},{"id":"c","label":"Águilas y Caribes"},{"id":"d","label":"Cardenales y Bravos"}]'::jsonb, 'b', null, 'Cultura LVBP', 'easy', 'active', null, 2, null),
  ('trv_ini_p085', '¿Cuántos strikes completan un ponche?', '[{"id":"a","label":"2"},{"id":"b","label":"4"},{"id":"c","label":"5"},{"id":"d","label":"3"}]'::jsonb, 'd', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p086', '¿Cuántos lados tiene el home plate?', '[{"id":"a","label":"4"},{"id":"b","label":"3"},{"id":"c","label":"5"},{"id":"d","label":"6"}]'::jsonb, 'c', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p087', '¿Cómo se llama una jugada defensiva que consigue tres outs?', '[{"id":"a","label":"Doble play"},{"id":"b","label":"Triple play"},{"id":"c","label":"Toque de bola"},{"id":"d","label":"Elevado de sacrificio"}]'::jsonb, 'b', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p088', '¿Cómo se llama la zona donde calientan los relevistas?', '[{"id":"a","label":"Cajón de bateo"},{"id":"b","label":"Dugout"},{"id":"c","label":"Bullpen"},{"id":"d","label":"Círculo de espera"}]'::jsonb, 'c', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p089', '¿Qué nombre recibe el bateo suave que se hace sosteniendo el bate sin un swing completo?', '[{"id":"a","label":"Jonrón"},{"id":"b","label":"Elevado profundo"},{"id":"c","label":"Línea"},{"id":"d","label":"Toque de bola"}]'::jsonb, 'd', null, 'Conceptos del juego', 'easy', 'active', null, 2, null),
  ('trv_ini_p090', '¿Cómo se llama al sustituto que entra a correr por otro jugador?', '[{"id":"a","label":"Lanzador abridor"},{"id":"b","label":"Corredor emergente"},{"id":"c","label":"Receptor suplente"},{"id":"d","label":"Bateador designado"}]'::jsonb, 'b', null, 'Conceptos del juego', 'easy', 'active', null, 2, null)
on conflict (id) do update set
  prompt = excluded.prompt,
  options = excluded.options,
  correct_option = excluded.correct_option,
  category = excluded.category,
  difficulty = excluded.difficulty,
  status = 'active',
  points = 2;

update public.pulse_trivia_questions
set status = 'disabled'
where difficulty = 'easy'
  and status = 'active'
  and id not like 'trv_ini_%';

update public.pulse_trivia_questions
set points = case difficulty
  when 'easy' then 2
  when 'medium' then 4
  when 'hard' then 6
  else points
end
where difficulty in ('easy', 'medium', 'hard');

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
  awarded := case
    when not is_correct then 0
    when sess.difficulty = 'easy' then 2
    when sess.difficulty = 'medium' then 4
    when sess.difficulty = 'hard' then 6
    else 0
  end;

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

grant execute on function public.pulse_trivia_start(text, text) to anon, authenticated;
grant execute on function public.pulse_trivia_answer(text, text, text, text) to anon, authenticated;

-- Cronograma LVBP 12 oct–5 nov 2026. No borra partidos ni predicciones.
update public.pulse_matches set away_team = 'Tigres de Aragua', home_team = 'Navegantes del Magallanes', starts_at = '2026-10-16 19:00:00-04'::timestamptz, updated_at = now() where id = 'lvbp_20261016_1900_mag_tig' and status = 'scheduled';
insert into public.pulse_matches (id, away_team, home_team, starts_at)
values
  ('lvbp_20261102_1900_crd_tig', 'Cardenales de Lara', 'Tigres de Aragua', '2026-11-02 19:00:00-04'::timestamptz),
  ('lvbp_20261103_1900_tib_leo', 'Tiburones de La Guaira', 'Leones del Caracas', '2026-11-03 19:00:00-04'::timestamptz),
  ('lvbp_20261103_1900_bra_mag', 'Bravos de Margarita', 'Navegantes del Magallanes', '2026-11-03 19:00:00-04'::timestamptz),
  ('lvbp_20261103_1900_car_agu', 'Caribes de Anzoátegui', 'Águilas del Zulia', '2026-11-03 19:00:00-04'::timestamptz),
  ('lvbp_20261104_1900_leo_tib', 'Leones del Caracas', 'Tiburones de La Guaira', '2026-11-04 19:00:00-04'::timestamptz),
  ('lvbp_20261104_1900_bra_mag', 'Bravos de Margarita', 'Navegantes del Magallanes', '2026-11-04 19:00:00-04'::timestamptz),
  ('lvbp_20261104_1900_tig_crd', 'Tigres de Aragua', 'Cardenales de Lara', '2026-11-04 19:00:00-04'::timestamptz),
  ('lvbp_20261104_1900_car_agu', 'Caribes de Anzoátegui', 'Águilas del Zulia', '2026-11-04 19:00:00-04'::timestamptz),
  ('lvbp_20261105_1900_bra_leo', 'Bravos de Margarita', 'Leones del Caracas', '2026-11-05 19:00:00-04'::timestamptz),
  ('lvbp_20261105_1900_tib_tig', 'Tiburones de La Guaira', 'Tigres de Aragua', '2026-11-05 19:00:00-04'::timestamptz),
  ('lvbp_20261105_1900_car_crd', 'Caribes de Anzoátegui', 'Cardenales de Lara', '2026-11-05 19:00:00-04'::timestamptz),
  ('lvbp_20261105_1900_mag_agu', 'Navegantes del Magallanes', 'Águilas del Zulia', '2026-11-05 19:00:00-04'::timestamptz)
on conflict (id) do update set
  away_team = excluded.away_team,
  home_team = excluded.home_team,
  starts_at = excluded.starts_at,
  updated_at = now()
where public.pulse_matches.status = 'scheduled';
