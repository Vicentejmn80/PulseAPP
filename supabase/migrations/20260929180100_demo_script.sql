create or replace function public.pulse_demo_script(p_seed text, p_away text, p_home text)
returns jsonb
language plpgsql
stable
as $$
declare
  inning integer;
  half text;
  outs integer;
  bases integer;
  home_score integer := 0;
  away_score integer := 0;
  seq integer := 0;
  roll integer;
  events jsonb := '[]'::jsonb;
  plays jsonb;
  play jsonb;
  i integer;
  n integer;
  at_ms integer;
  runs integer;
  kind text;
  label text;
  next_bases integer;
  before_home integer;
  before_away integer;
  runs_at_start integer;
  bases_text text;
  questions jsonb := '[]'::jsonb;
  ev jsonb;
  prev jsonb;
  first_homer integer;
  homer_count integer := 0;
  homer_at integer;
  next_run jsonb;
  prev_run jsonb;
  before_score integer;
  after_score integer;
  lead_a text;
  lead_b text;
  spot jsonb;
  spot_end integer;
  quick_inning integer;
  quick_index integer;
  quick_next jsonb;
  bucket text;
begin
  for inning in 1..9 loop
    runs_at_start := home_score + away_score;
    foreach half in array array['alta', 'baja'] loop
      outs := 0;
      bases := 0;
      plays := '[]'::jsonb;
      while outs < 3 and jsonb_array_length(plays) < 8 loop
        seq := seq + 1;
        roll := ((hashtext(p_seed || ':' || seq::text)::bigint % 100) + 100) % 100;
        before_home := home_score;
        before_away := away_score;
        runs := 0;
        next_bases := bases;
        if roll < 22 then
          kind := 'ponche'; label := 'Ponche.'; outs := outs + 1;
        elsif roll < 46 then
          kind := 'out'; label := 'Out al campo.'; outs := outs + 1;
        elsif roll < 54 then
          if (bases & 1) = 1 and outs < 2 then
            kind := 'doble_play'; label := 'Doble play.'; outs := outs + 2; next_bases := bases & ~1;
          else
            kind := 'out'; label := 'Out al campo.'; outs := outs + 1;
          end if;
        elsif roll < 64 then
          kind := 'boleto'; label := 'Base por bolas.';
          if (next_bases & 1) = 0 then next_bases := next_bases | 1;
          elsif (next_bases & 2) = 0 then next_bases := next_bases | 3;
          elsif (next_bases & 4) = 0 then next_bases := 7;
          else runs := 1; next_bases := 7;
          end if;
        elsif roll < 80 then
          kind := 'sencillo'; label := 'Sencillo.';
          if (bases & 4) = 4 then runs := 1; end if;
          next_bases := 1;
          if (bases & 2) = 2 then next_bases := next_bases | 4; end if;
          if (bases & 1) = 1 then next_bases := next_bases | 2; end if;
        elsif roll < 90 then
          kind := 'doble'; label := '¡Doble!';
          if (bases & 4) = 4 then runs := runs + 1; end if;
          if (bases & 2) = 2 then runs := runs + 1; end if;
          next_bases := 2;
          if (bases & 1) = 1 then next_bases := next_bases | 4; end if;
        elsif roll < 95 then
          kind := 'triple'; label := '¡Triple!';
          runs := (case when (bases & 1) = 1 then 1 else 0 end) + (case when (bases & 2) = 2 then 1 else 0 end) + (case when (bases & 4) = 4 then 1 else 0 end);
          next_bases := 4;
        elsif roll < 98 then
          kind := 'jonron'; label := '¡Jonrón!';
          runs := 1 + (case when (bases & 1) = 1 then 1 else 0 end) + (case when (bases & 2) = 2 then 1 else 0 end) + (case when (bases & 4) = 4 then 1 else 0 end);
          next_bases := 0;
        elsif (bases & 1) = 1 and (bases & 2) = 0 then
          kind := 'robo'; label := 'Robo de segunda.'; next_bases := (bases & ~1) | 2;
        elsif (bases & 2) = 2 and (bases & 4) = 0 then
          kind := 'robo'; label := 'Robo de tercera. Corredor en posición de anotar.'; next_bases := (bases & ~2) | 4;
        else
          kind := 'out'; label := 'Out al campo.'; outs := outs + 1;
        end if;
        outs := least(outs, 3);
        if outs >= 3 then next_bases := 0; end if;
        if half = 'alta' then away_score := away_score + runs; else home_score := home_score + runs; end if;
        bases_text := case next_bases
          when 1 then ' Corredor en primera.'
          when 2 then ' Corredor en segunda.'
          when 3 then ' Corredores en primera y segunda.'
          when 4 then ' Corredor en tercera, en posición de anotar.'
          when 5 then ' Corredores en primera y tercera.'
          when 6 then ' Corredores en segunda y tercera.'
          when 7 then ' Bases llenas.'
          else ''
        end;
        if outs >= 3 then bases_text := ''; end if;
        label := label || bases_text;
        if runs = 1 then label := label || ' Entra una carrera.'; end if;
        if runs > 1 then label := label || ' Entran ' || runs::text || ' carreras.'; end if;
        if runs >= 2 then label := label || ' Rally ofensivo.'; end if;
        if (before_away > before_home and home_score > away_score) or (before_home > before_away and away_score > home_score) then
          label := label || ' Cambio de ventaja.';
        end if;
        if outs >= 3 then
          label := label || case when half = 'baja' then ' Final del inning.' else ' Final de la mitad.' end;
        end if;
        bases := next_bases;
        plays := plays || jsonb_build_array(jsonb_build_object(
          'inning', inning, 'half', half, 'kind', kind, 'text', trim(label),
          'home', home_score, 'away', away_score, 'outs', outs, 'bases', bases
        ));
      end loop;
      n := jsonb_array_length(plays);
      for i in 0..greatest(n - 1, -1) loop
        exit when n = 0;
        at_ms := (inning - 1) * 120000 + case when half = 'alta' then 4000 else 64000 end + (i * 52000 / greatest(n, 1));
        events := events || jsonb_build_array((plays->i) || jsonb_build_object('atMs', at_ms));
      end loop;
    end loop;
    if home_score + away_score = runs_at_start and jsonb_array_length(events) > 0 then
      play := events->(jsonb_array_length(events) - 1);
      events := jsonb_set(events, array[(jsonb_array_length(events) - 1)::text], play || jsonb_build_object('text', trim((play->>'text') || ' Inning sin carreras.')));
    end if;
  end loop;

  if home_score = away_score then
    home_score := home_score + 1;
    events := events || jsonb_build_array(jsonb_build_object(
      'inning', 9, 'half', 'baja', 'atMs', 9 * 120000 - 5000, 'kind', 'carrera',
      'text', 'Entra la carrera que define la simulación.',
      'home', home_score, 'away', away_score, 'outs', 2, 'bases', 0
    ));
  end if;

  first_homer := null;
  homer_at := 9 * 120000 - 1000;
  for i in 0..jsonb_array_length(events) - 1 loop
    ev := events->i;
    if ev->>'kind' = 'jonron' then
      homer_count := homer_count + 1;
      if first_homer is null then
        first_homer := (ev->>'inning')::int;
        homer_at := (ev->>'atMs')::int;
      end if;
    end if;
  end loop;

  next_run := null;
  for i in 1..jsonb_array_length(events) - 1 loop
    ev := events->i;
    prev := events->(i - 1);
    if (ev->>'atMs')::int > 2 * 120000 + 10000
       and (ev->>'home')::int + (ev->>'away')::int > (prev->>'home')::int + (prev->>'away')::int then
      next_run := ev;
      prev_run := prev;
      exit;
    end if;
  end loop;

  before_score := 0;
  after_score := 0;
  for i in 0..jsonb_array_length(events) - 1 loop
    ev := events->i;
    if (ev->>'inning')::int <= 3 then before_score := (ev->>'home')::int + (ev->>'away')::int; end if;
    if (ev->>'inning')::int <= 4 then after_score := (ev->>'home')::int + (ev->>'away')::int; end if;
  end loop;

  questions := questions || jsonb_build_array(
    jsonb_build_object(
      'id', 'q_homer', 'atMs', 15000, 'resolveMs', homer_at, 'tone', 'main',
      'prompt', '¿En qué inning crees que llegará el primer jonrón?',
      'options', jsonb_build_array(
        jsonb_build_object('id', '12', 'label', '1.º–2.º'),
        jsonb_build_object('id', '34', 'label', '3.º–4.º'),
        jsonb_build_object('id', '56', 'label', '5.º–6.º'),
        jsonb_build_object('id', '79', 'label', '7.º–9.º'),
        jsonb_build_object('id', 'none', 'label', 'No habrá jonrón')
      ),
      'correct', case
        when first_homer is null then 'none'
        when first_homer <= 2 then '12'
        when first_homer <= 4 then '34'
        when first_homer <= 6 then '56'
        else '79'
      end
    ),
    jsonb_build_object(
      'id', 'q_next_run', 'atMs', 2 * 120000 + 10000,
      'resolveMs', coalesce((next_run->>'atMs')::int, 3 * 120000 - 1000),
      'tone', 'main',
      'prompt', '¿Qué equipo anotará la próxima carrera?',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'away', 'label', p_away),
        jsonb_build_object('id', 'home', 'label', p_home),
        jsonb_build_object('id', 'none', 'label', 'Ninguno')
      ),
      'correct', case
        when next_run is null then 'none'
        when (next_run->>'away')::int > (prev_run->>'away')::int then 'away'
        else 'home'
      end
    ),
    jsonb_build_object(
      'id', 'q_inning_runs', 'atMs', 3 * 120000 + 8000, 'resolveMs', 4 * 120000 - 1000, 'tone', 'main',
      'prompt', '¿Cuántas carreras habrá en este inning?',
      'options', jsonb_build_array(
        jsonb_build_object('id', '0', 'label', '0'),
        jsonb_build_object('id', '1', 'label', '1'),
        jsonb_build_object('id', '2', 'label', '2'),
        jsonb_build_object('id', '3', 'label', '3+')
      ),
      'correct', case
        when after_score - before_score <= 0 then '0'
        when after_score - before_score = 1 then '1'
        when after_score - before_score = 2 then '2'
        else '3'
      end
    )
  );

  before_score := 0;
  for i in 0..jsonb_array_length(events) - 1 loop
    ev := events->i;
    if (ev->>'inning')::int <= 5 then
      before_score := (ev->>'home')::int;
      after_score := (ev->>'away')::int;
    end if;
  end loop;
  lead_a := case when before_score = after_score then 'tie' when after_score > before_score then 'away' else 'home' end;

  questions := questions || jsonb_build_array(jsonb_build_object(
    'id', 'q_lead5', 'atMs', 4 * 120000 + 8000, 'resolveMs', 5 * 120000 - 1000, 'tone', 'main',
    'prompt', '¿Quién llegará con ventaja al final del 5.º inning?',
    'options', jsonb_build_array(
      jsonb_build_object('id', 'away', 'label', p_away),
      jsonb_build_object('id', 'home', 'label', p_home),
      jsonb_build_object('id', 'tie', 'label', 'Empate')
    ),
    'correct', lead_a
  ));

  before_score := 0; after_score := 0;
  for i in 0..jsonb_array_length(events) - 1 loop
    ev := events->i;
    if (ev->>'inning')::int <= 1 then
      before_score := (ev->>'home')::int;
      after_score := (ev->>'away')::int;
    end if;
  end loop;
  lead_a := case when before_score = after_score then 'tie' when after_score > before_score then 'away' else 'home' end;
  before_score := 0; after_score := 0;
  for i in 0..jsonb_array_length(events) - 1 loop
    ev := events->i;
    if (ev->>'inning')::int <= 6 then
      before_score := (ev->>'home')::int;
      after_score := (ev->>'away')::int;
    end if;
  end loop;
  lead_b := case when before_score = after_score then 'tie' when after_score > before_score then 'away' else 'home' end;

  questions := questions || jsonb_build_array(
    jsonb_build_object(
      'id', 'q_swing', 'atMs', 120000 + 12000, 'resolveMs', 6 * 120000 - 1000, 'tone', 'main',
      'prompt', '¿Habrá cambio de ventaja antes del 7.º inning?',
      'options', jsonb_build_array(jsonb_build_object('id', 'si', 'label', 'Sí'), jsonb_build_object('id', 'no', 'label', 'No')),
      'correct', case when lead_a <> 'tie' and lead_b <> 'tie' and lead_a <> lead_b then 'si' else 'no' end
    ),
    jsonb_build_object(
      'id', 'q_homers', 'atMs', 5 * 120000 + 12000, 'resolveMs', 9 * 120000 - 1000, 'tone', 'main',
      'prompt', '¿Cuántos jonrones habrá en todo el partido?',
      'options', jsonb_build_array(
        jsonb_build_object('id', '0', 'label', '0'),
        jsonb_build_object('id', '1', 'label', '1'),
        jsonb_build_object('id', '2', 'label', '2'),
        jsonb_build_object('id', '3', 'label', '3+')
      ),
      'correct', case when homer_count <= 0 then '0' when homer_count = 1 then '1' when homer_count = 2 then '2' else '3' end
    )
  );

  spot := null;
  for i in 0..jsonb_array_length(events) - 1 loop
    ev := events->i;
    if (ev->>'bases')::int = 3 and (ev->>'outs')::int = 1 then
      spot := ev;
      exit;
    end if;
  end loop;
  if spot is not null then
    spot_end := (spot->>'home')::int + (spot->>'away')::int;
    for i in 0..jsonb_array_length(events) - 1 loop
      ev := events->i;
      if (ev->>'inning')::int <= (spot->>'inning')::int then
        spot_end := (ev->>'home')::int + (ev->>'away')::int;
      end if;
    end loop;
    spot_end := spot_end - ((spot->>'home')::int + (spot->>'away')::int);
    questions := questions || jsonb_build_array(jsonb_build_object(
      'id', 'q_spot', 'atMs', (spot->>'atMs')::int + 2000, 'resolveMs', (spot->>'inning')::int * 120000 - 1000, 'tone', 'main',
      'prompt', 'Hay corredores en 1.ª y 2.ª con un out. ¿Cómo crees que termina este inning?',
      'options', jsonb_build_array(
        jsonb_build_object('id', '0', 'label', '0 carreras'),
        jsonb_build_object('id', '1', 'label', '1 carrera'),
        jsonb_build_object('id', '2', 'label', '2+ carreras')
      ),
      'correct', case when spot_end <= 0 then '0' when spot_end = 1 then '1' else '2' end
    ));
  end if;

  foreach quick_inning in array array[1, 2, 3, 5, 7, 8] loop
    quick_index := null;
    for i in 0..jsonb_array_length(events) - 1 loop
      ev := events->i;
      if (ev->>'inning')::int = quick_inning and ev->>'half' = 'alta' then
        quick_index := i;
        exit;
      end if;
    end loop;
    if quick_index is null or quick_index + 1 >= jsonb_array_length(events) then
      continue;
    end if;
    ev := events->quick_index;
    quick_next := events->(quick_index + 1);
    if (quick_next->>'home')::int + (quick_next->>'away')::int > (ev->>'home')::int + (ev->>'away')::int then
      bucket := 'run';
    elsif quick_next->>'kind' in ('doble', 'triple', 'jonron') then
      bucket := 'xbh';
    elsif quick_next->>'kind' in ('boleto', 'sencillo', 'robo') then
      bucket := 'base';
    else
      bucket := 'out';
    end if;
    questions := questions || jsonb_build_array(jsonb_build_object(
      'id', 'q_quick_' || quick_inning::text,
      'atMs', (ev->>'atMs')::int + 1500,
      'resolveMs', greatest((ev->>'atMs')::int + 8000, (quick_next->>'atMs')::int),
      'tone', 'quick',
      'prompt', '¿Qué sigue en esta secuencia?',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'out', 'label', 'Out'),
        jsonb_build_object('id', 'base', 'label', 'Se embasa'),
        jsonb_build_object('id', 'xbh', 'label', 'Extrabase'),
        jsonb_build_object('id', 'run', 'label', 'Carrera')
      ),
      'correct', bucket
    ));
  end loop;

  return jsonb_build_object(
    'seed', p_seed,
    'innings', 9,
    'msPerInning', 120000,
    'finalHome', home_score,
    'finalAway', away_score,
    'events', events,
    'questions', questions
  );
end;
$$;
