-- Live match center, per-event bingo, crowd split, duels, and the practice simulator.
-- Simulation rows use id sim_% and never enter the ranking or the October pleno.

insert into public.pulse_pilot_config (key, value) values ('SOCIAL_MIN', '5')
on conflict (key) do nothing;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.pulse_matches'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.pulse_matches drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.pulse_matches
  add constraint pulse_matches_status_check
  check (status in ('scheduled', 'locked', 'in_progress', 'finished', 'postponed', 'cancelled'));

alter table public.pulse_matches
  add column if not exists inning integer not null default 1,
  add column if not exists half text not null default 'alta',
  add column if not exists is_simulation boolean not null default false;

alter table public.pulse_matches drop constraint if exists pulse_matches_half_check;
alter table public.pulse_matches
  add constraint pulse_matches_half_check check (half in ('alta', 'baja'));

create table if not exists public.pulse_match_events (
  id text primary key,
  match_id text not null references public.pulse_matches (id) on delete cascade,
  inning integer not null check (inning between 1 and 20),
  half text not null check (half in ('alta', 'baja')),
  event_type text not null check (event_type in (
    'jonron', 'ponche', 'doble_play', 'base_robada', 'error', 'hit', 'carrera', 'cambio_pitcher', 'out', 'otro',
    'bases_llenas', 'triple', 'sacrificio'
  )),
  description text not null default '',
  home_score_after integer not null check (home_score_after >= 0),
  away_score_after integer not null check (away_score_after >= 0),
  created_at timestamptz not null default now()
);

create index if not exists pulse_match_events_match_idx
  on public.pulse_match_events (match_id, created_at desc);

create table if not exists public.pulse_bingo_hits (
  match_id text not null references public.pulse_matches (id) on delete cascade,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  pick_id text not null,
  resolved_at timestamptz not null default now(),
  primary key (match_id, user_id, pick_id)
);

create table if not exists public.pulse_duels (
  id text primary key,
  match_id text not null references public.pulse_matches (id) on delete cascade,
  challenger_id text not null references public.pulse_profiles (id) on delete cascade,
  opponent_id text not null references public.pulse_profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'resolved', 'void')),
  challenger_points integer,
  opponent_points integer,
  winner_user_id text,
  created_at timestamptz not null default now(),
  unique (match_id, challenger_id, opponent_id),
  check (challenger_id <> opponent_id)
);

create table if not exists public.pulse_simulations (
  match_id text primary key references public.pulse_matches (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'stopped')),
  interval_seconds integer not null default 25,
  next_at timestamptz not null default now(),
  step integer not null default 0,
  live_open boolean not null default false,
  live_done boolean not null default false,
  user_id text
);

alter table public.pulse_match_events enable row level security;
alter table public.pulse_bingo_hits enable row level security;
alter table public.pulse_duels enable row level security;
alter table public.pulse_simulations enable row level security;

create or replace function public.pulse_bingo_pick_for(p_type text, p_inning integer)
returns text
language sql
immutable
as $$
  select case
    when p_type in ('jonron', 'ponche', 'doble_play', 'base_robada', 'error', 'bases_llenas', 'triple', 'sacrificio') then p_type
    when p_type = 'carrera' and p_inning = 1 then 'carrera_1er'
    else null
  end;
$$;

create or replace function public.pulse_bingo_mark(p_match text, p_pick text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  card record;
  hits integer;
  event_points integer := public.pulse_cfg_int('BINGO_EVENT_POINTS');
  full_bonus integer := public.pulse_cfg_int('BINGO_FULL_BONUS');
  earned date;
begin
  if coalesce(p_pick, '') = '' then
    return;
  end if;
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return;
  end if;
  earned := (match.starts_at at time zone 'America/Caracas')::date;
  for card in
    select * from public.pulse_bingo_cards
    where match_id = p_match and p_pick = any (picks)
  loop
    insert into public.pulse_bingo_hits (match_id, user_id, pick_id)
    values (p_match, card.user_id, p_pick)
    on conflict do nothing;
    if found then
      perform public.pulse_credit(
        card.user_id, 'bingo', 'bingo:' || p_match || ':' || card.user_id || ':' || p_pick, event_points,
        jsonb_build_object('earnedOn', earned, 'matchId', match.id, 'pick', p_pick)
      );
      select count(*) into hits
      from public.pulse_bingo_hits
      where match_id = p_match and user_id = card.user_id;
      if hits >= 5 then
        perform public.pulse_credit(
          card.user_id, 'bingo', 'bingo_full:' || p_match || ':' || card.user_id, full_bonus,
          jsonb_build_object('earnedOn', earned, 'matchId', match.id, 'full', true)
        );
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.pulse_score_bingo(p_match text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  result public.pulse_bingo_results;
  card record;
  pick text;
begin
  select * into match from public.pulse_matches where id = p_match;
  select * into result from public.pulse_bingo_results where match_id = p_match;
  if match.id is null or result.match_id is null or result.status = 'void' or match.status = 'cancelled' then
    return;
  end if;
  for card in select user_id from public.pulse_bingo_cards where match_id = p_match loop
    perform public.pulse_credit(card.user_id, 'bingo', 'bingo:' || p_match || ':' || card.user_id, 0, '{}'::jsonb);
  end loop;
  foreach pick in array result.occurred loop
    perform public.pulse_bingo_mark(p_match, pick);
  end loop;
end;
$$;

create or replace function public.pulse_apply_match_event(
  p_match text,
  p_inning integer,
  p_half text,
  p_type text,
  p_description text,
  p_home integer,
  p_away integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  event_id text;
  home_now integer;
  away_now integer;
begin
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status in ('finished', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'Ese juego ya no acepta jugadas.');
  end if;
  if p_inning is null or p_inning < 1 or p_inning > 15 or p_half not in ('alta', 'baja') then
    return jsonb_build_object('ok', false, 'error', 'Revisa el inning.');
  end if;
  if p_type not in (
    'jonron', 'ponche', 'doble_play', 'base_robada', 'error', 'hit', 'carrera', 'cambio_pitcher', 'out', 'otro',
    'bases_llenas', 'triple', 'sacrificio'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Esa jugada no está en la lista.');
  end if;
  home_now := coalesce(match.home_score, 0);
  away_now := coalesce(match.away_score, 0);
  if p_home is null or p_away is null or p_home < home_now or p_away < away_now or p_home > 99 or p_away > 99 then
    return jsonb_build_object('ok', false, 'error', 'El marcador no puede bajar.');
  end if;
  event_id := 'mevt_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_match_events (
    id, match_id, inning, half, event_type, description, home_score_after, away_score_after
  ) values (
    event_id, match.id, p_inning, p_half, p_type, left(trim(coalesce(p_description, '')), 140), p_home, p_away
  );
  update public.pulse_matches
  set home_score = p_home,
      away_score = p_away,
      inning = p_inning,
      half = p_half,
      status = 'in_progress',
      updated_at = now()
  where id = match.id;
  perform public.pulse_bingo_mark(match.id, public.pulse_bingo_pick_for(p_type, p_inning));
  return jsonb_build_object('ok', true, 'id', event_id);
end;
$$;

create or replace function public.pulse_admin_open_live(p_admin_key text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null or match.status in ('finished', 'cancelled') or match.is_simulation then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no se puede abrir en vivo.');
  end if;
  update public.pulse_matches
  set status = 'in_progress',
      home_score = coalesce(home_score, 0),
      away_score = coalesce(away_score, 0),
      inning = coalesce(nullif(inning, 0), 1),
      half = coalesce(half, 'alta'),
      updated_at = now()
  where id = match.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_add_event(
  p_admin_key text,
  p_match text,
  p_inning integer,
  p_half text,
  p_type text,
  p_description text,
  p_home integer,
  p_away integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return public.pulse_apply_match_event(p_match, p_inning, p_half, p_type, p_description, p_home, p_away);
end;
$$;

create or replace function public.pulse_resolve_duels(p_match text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  duel record;
  left_points integer;
  right_points integer;
begin
  for duel in
    select * from public.pulse_duels
    where match_id = p_match and status in ('pending', 'ready')
    for update
  loop
    select tx.points into left_points
    from public.pulse_match_predictions pred
    join public.pulse_transactions tx on tx.source_type = 'prediction' and tx.source_id = pred.id
    where pred.match_id = p_match and pred.user_id = duel.challenger_id;
    select tx.points into right_points
    from public.pulse_match_predictions pred
    join public.pulse_transactions tx on tx.source_type = 'prediction' and tx.source_id = pred.id
    where pred.match_id = p_match and pred.user_id = duel.opponent_id;
    if left_points is null or right_points is null then
      update public.pulse_duels set status = 'void' where id = duel.id;
    else
      update public.pulse_duels
      set status = 'resolved',
          challenger_points = left_points,
          opponent_points = right_points,
          winner_user_id = case
            when left_points > right_points then duel.challenger_id
            when right_points > left_points then duel.opponent_id
            else null
          end
      where id = duel.id;
    end if;
  end loop;
end;
$$;

create or replace function public.pulse_match_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.pulse_void_bingo(new.id);
  end if;
  if not coalesce(new.is_simulation, false)
     and (
       new.status is distinct from old.status
       or new.home_score is distinct from old.home_score
       or new.away_score is distinct from old.away_score
       or new.starts_at is distinct from old.starts_at
     ) then
    perform public.pulse_award_plenos((old.starts_at at time zone 'America/Caracas')::date);
    perform public.pulse_award_plenos((new.starts_at at time zone 'America/Caracas')::date);
  end if;
  return new;
end;
$$;

create or replace function public.pulse_duel_challenge(p_token text, p_match text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  opponent public.pulse_profiles;
  found_count integer;
  mine boolean;
  theirs boolean;
  duel_id text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para retar.');
  end if;
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null or match.status in ('finished', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'Ese juego ya no acepta retos.');
  end if;
  select count(*) into found_count from public.pulse_profiles where lower(alias) = lower(trim(coalesce(p_alias, '')));
  if found_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No encontré ese alias.');
  end if;
  if found_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'Hay más de un perfil con ese alias.');
  end if;
  select * into opponent from public.pulse_profiles where lower(alias) = lower(trim(p_alias));
  if opponent.id = uid then
    return jsonb_build_object('ok', false, 'error', 'Elige a otra persona.');
  end if;
  select exists (select 1 from public.pulse_match_predictions where match_id = match.id and user_id = uid) into mine;
  select exists (select 1 from public.pulse_match_predictions where match_id = match.id and user_id = opponent.id) into theirs;
  duel_id := 'duel_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_duels (id, match_id, challenger_id, opponent_id, status)
  values (duel_id, match.id, uid, opponent.id, case when mine and theirs then 'ready' else 'pending' end)
  on conflict (match_id, challenger_id, opponent_id) do update
  set status = case
    when public.pulse_duels.status = 'resolved' then public.pulse_duels.status
    when mine and theirs then 'ready'
    else 'pending'
  end;
  return jsonb_build_object(
    'ok', true,
    'pending', not (mine and theirs),
    'alias', opponent.alias
  );
end;
$$;

create or replace function public.pulse_live_answer(p_token text, p_question text, p_option text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  q public.pulse_live_questions;
  simulated boolean;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para responder.');
  end if;
  select * into q from public.pulse_live_questions where id = p_question for update;
  if q.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no está disponible.');
  end if;
  if q.status <> 'open' or (q.closes_at is not null and q.closes_at <= now()) then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta ya cerró.');
  end if;
  if not exists (select 1 from jsonb_array_elements(q.options) opt where opt->>'id' = p_option) then
    return jsonb_build_object('ok', false, 'error', 'Elige una de las opciones.');
  end if;
  insert into public.pulse_live_answers (id, question_id, user_id, option_id)
  values ('lans_' || replace(gen_random_uuid()::text, '-', ''), q.id, uid, p_option);
  perform public.pulse_log_event('live_question_answered', uid, null, q.id || ':' || uid, jsonb_build_object('matchId', q.match_id));
  select is_simulation into simulated from public.pulse_matches where id = q.match_id;
  if not coalesce(simulated, false) then
    perform public.pulse_mark_play_day(uid);
  end if;
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Ya respondiste esta pregunta.');
end;
$$;

create or replace function public.pulse_sim_script()
returns jsonb
language sql
immutable
as $$
  select '[
    {"inning":1,"half":"alta","type":"out","desc":"Primer out del encuentro"},
    {"inning":1,"half":"alta","type":"hit","desc":"Sencillo al jardín"},
    {"inning":1,"half":"alta","type":"carrera","desc":"Llega la primera carrera","run":"away"},
    {"inning":1,"half":"baja","type":"ponche","desc":"Ponche al primer bate"},
    {"inning":1,"half":"baja","type":"jonron","desc":"Jonrón solitario","run":"home"},
    {"inning":2,"half":"alta","type":"error","desc":"Error en el cuadro"},
    {"inning":2,"half":"alta","type":"carrera","desc":"Otra carrera visitante","run":"away"},
    {"inning":3,"half":"baja","type":"doble_play","desc":"Doble play para salir de la entrada"},
    {"inning":4,"half":"alta","type":"base_robada","desc":"Robo de segunda"},
    {"inning":5,"half":"baja","type":"ponche","desc":"Ponche con la casa llena"},
    {"inning":6,"half":"alta","type":"hit","desc":"Hit al bosque derecho"},
    {"inning":6,"half":"baja","type":"jonron","desc":"Otro jonrón, esta vez del local","run":"home"},
    {"inning":7,"half":"alta","type":"out","desc":"Fly de out"},
    {"inning":7,"half":"baja","type":"carrera","desc":"Carrera anotada por el local","run":"home"},
    {"inning":8,"half":"alta","type":"cambio_pitcher","desc":"Cambio de pitcher"},
    {"inning":8,"half":"baja","type":"hit","desc":"Sencillo para abrir la baja"},
    {"inning":9,"half":"alta","type":"out","desc":"Último out de la alta"},
    {"inning":9,"half":"baja","type":"carrera","desc":"La carrera que cierra el juego","run":"home"}
  ]'::jsonb;
$$;

create or replace function public.pulse_score_match_now(p_match text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  pred public.pulse_match_predictions;
  breakdown jsonb;
begin
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null or match.home_score is null or match.away_score is null or match.home_score = match.away_score then
    return;
  end if;
  for pred in
    select * from public.pulse_match_predictions
    where match_id = match.id and processed_at is null
    for update
  loop
    breakdown := public.pulse_score_breakdown(
      pred.predicted_home_score, pred.predicted_away_score, match.home_score, match.away_score
    ) || jsonb_build_object(
      'matchId', match.id,
      'homeScore', match.home_score,
      'awayScore', match.away_score,
      'matchStartsAt', match.starts_at
    );
    insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
    values (
      'tx_' || pred.id, pred.user_id, 'exp_tobo', 'prediction', pred.id, (breakdown->>'total')::int, breakdown
    )
    on conflict (source_type, source_id) do update
    set points = excluded.points,
        metadata = excluded.metadata
    where public.pulse_transactions.points is distinct from excluded.points
       or public.pulse_transactions.metadata is distinct from excluded.metadata;
    update public.pulse_match_predictions
    set processed_at = coalesce(processed_at, now()),
        locked_at = coalesce(locked_at, now())
    where id = pred.id;
  end loop;
end;
$$;

create or replace function public.pulse_sim_clear()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pulse_transactions tx
  where coalesce(tx.metadata->>'matchId', '') like 'sim_%'
     or tx.source_id like 'bingo:sim_%'
     or tx.source_id like 'bingo_full:sim_%'
     or tx.source_id in (
       select answer.id
       from public.pulse_live_answers answer
       join public.pulse_live_questions question on question.id = answer.question_id
       where question.match_id like 'sim_%'
     );
  delete from public.pulse_matches where id like 'sim_%' or is_simulation;
end;
$$;

create or replace function public.pulse_sim_finish(p_match text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  final_home integer;
  final_away integer;
begin
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null or not match.is_simulation then
    return;
  end if;
  final_home := coalesce(match.home_score, 0);
  final_away := coalesce(match.away_score, 0);
  if final_home = final_away then
    final_home := final_home + 1;
  end if;
  update public.pulse_matches
  set home_score = final_home,
      away_score = final_away,
      inning = 9,
      half = 'baja',
      updated_at = now()
  where id = match.id;
  perform public.pulse_score_match_now(match.id);
  perform public.pulse_resolve_duels(match.id);
  update public.pulse_matches
  set status = 'finished', updated_at = now()
  where id = match.id;
  update public.pulse_simulations set status = 'stopped' where match_id = match.id;
end;
$$;

create or replace function public.pulse_sim_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sim public.pulse_simulations;
  script jsonb;
  item jsonb;
  match public.pulse_matches;
  home_score integer;
  away_score integer;
  applied jsonb;
  ans record;
  points integer := public.pulse_cfg_int('LIVE_POINTS');
begin
  for sim in
    select * from public.pulse_simulations
    where status = 'running' and next_at <= now()
    for update
  loop
    script := public.pulse_sim_script();
    select * into match from public.pulse_matches where id = sim.match_id for update;
    if match.id is null then
      delete from public.pulse_simulations where match_id = sim.match_id;
      continue;
    end if;
    if sim.step >= jsonb_array_length(script) then
      perform public.pulse_sim_finish(match.id);
      continue;
    end if;
    item := script -> sim.step;
    home_score := coalesce(match.home_score, 0);
    away_score := coalesce(match.away_score, 0);
    if item->>'run' = 'home' then
      home_score := home_score + 1;
    elsif item->>'run' = 'away' then
      away_score := away_score + 1;
    end if;
    applied := public.pulse_apply_match_event(
      match.id,
      (item->>'inning')::int,
      item->>'half',
      item->>'type',
      item->>'desc',
      home_score,
      away_score
    );
    if coalesce(applied->>'ok', 'false') <> 'true' then
      update public.pulse_simulations set status = 'stopped' where match_id = match.id;
      continue;
    end if;
    update public.pulse_simulations
    set step = sim.step + 1,
        next_at = now() + make_interval(secs => sim.interval_seconds)
    where match_id = sim.match_id;
    if sim.step + 1 = 3 and not sim.live_open then
      insert into public.pulse_live_questions (id, match_id, prompt, options, status, closes_at)
      values (
        'sim_live_q', match.id, '¿Anotan carreras en este inning?',
        '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb,
        'open', now() + interval '3 minutes'
      )
      on conflict (id) do nothing;
      update public.pulse_simulations set live_open = true where match_id = match.id;
    end if;
    if sim.step + 1 = 8 and not sim.live_done then
      update public.pulse_live_questions
      set status = 'resolved', correct_option = 'si', resolved_at = now()
      where id = 'sim_live_q' and match_id = match.id and status = 'open';
      for ans in select * from public.pulse_live_answers where question_id = 'sim_live_q' loop
        if ans.option_id = 'si' then
          perform public.pulse_credit(
            ans.user_id, 'live_answer', ans.id, points,
            jsonb_build_object('earnedOn', (match.starts_at at time zone 'America/Caracas')::date, 'matchId', match.id)
          );
        else
          perform public.pulse_credit(ans.user_id, 'live_answer', ans.id, 0, jsonb_build_object('matchId', match.id));
        end if;
      end loop;
      update public.pulse_simulations set live_done = true where match_id = match.id;
    end if;
    if sim.step + 1 >= jsonb_array_length(script) then
      perform public.pulse_sim_finish(match.id);
    end if;
  end loop;
end;
$$;

create or replace function public.pulse_admin_sim_start(p_admin_key text, p_token text, p_interval integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  seconds integer;
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_sim_clear();
  uid := public.pulse_user_id(p_token);
  seconds := least(60, greatest(20, coalesce(p_interval, 25)));
  insert into public.pulse_matches (
    id, home_team, away_team, starts_at, status, home_score, away_score, inning, half, is_simulation
  ) values (
    'sim_live', 'Equipo Azul', 'Equipo Rojo', now(), 'in_progress', 0, 0, 1, 'alta', true
  );
  insert into public.pulse_simulations (match_id, status, interval_seconds, next_at, step, user_id)
  values ('sim_live', 'running', seconds, now(), 0, uid);
  if uid is not null then
    insert into public.pulse_match_predictions (
      id, user_id, match_id, predicted_winner, predicted_home_score, predicted_away_score, locked_at
    ) values (
      'pred_sim_live_' || replace(uid, 'user_', ''),
      uid, 'sim_live', 'Equipo Azul', 4, 2, now()
    )
    on conflict (user_id, match_id) do nothing;
    insert into public.pulse_bingo_cards (id, match_id, user_id, picks)
    values (
      'bingo_sim_' || replace(uid, 'user_', ''),
      'sim_live', uid,
      array['jonron', 'ponche', 'doble_play', 'error', 'base_robada']
    )
    on conflict (match_id, user_id) do nothing;
  end if;
  perform public.pulse_sim_tick();
  return jsonb_build_object('ok', true, 'matchId', 'sim_live', 'seconds', seconds);
end;
$$;

create or replace function public.pulse_admin_sim_stop(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_sim_clear();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_sim_status(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sim public.pulse_simulations;
  match public.pulse_matches;
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_sim_tick();
  select * into sim from public.pulse_simulations where match_id = 'sim_live';
  select * into match from public.pulse_matches where id = 'sim_live';
  if match.id is null then
    return jsonb_build_object('ok', true, 'running', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'running', sim.status = 'running',
    'matchId', match.id,
    'status', match.status,
    'step', coalesce(sim.step, 0),
    'total', jsonb_array_length(public.pulse_sim_script()),
    'inning', match.inning,
    'half', match.half,
    'homeScore', match.home_score,
    'awayScore', match.away_score,
    'seconds', sim.interval_seconds
  );
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
        m.is_simulation as simulation,
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

create or replace function public.pulse_match_center(p_token text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  pred public.pulse_match_predictions;
  breakdown jsonb;
  mood text;
  minimum integer := public.pulse_cfg_int('SOCIAL_MIN');
  pick_total integer;
  question jsonb;
begin
  perform public.pulse_sim_tick();
  uid := public.pulse_user_id(p_token);
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  select * into pred from public.pulse_match_predictions where match_id = match.id and user_id = uid;
  if pred.id is not null and match.home_score is not null and match.away_score is not null then
    breakdown := public.pulse_score_breakdown(
      pred.predicted_home_score, pred.predicted_away_score, match.home_score, match.away_score
    );
    mood := case when (breakdown->>'errorTotal')::int <= 4 then 'cerca' else 'lejos' end;
  end if;
  select count(*) into pick_total from public.pulse_match_predictions where match_id = match.id;

  select coalesce(jsonb_agg(row_to_json(q) order by q."createdAt" desc), '[]'::jsonb) into question
  from (
    select
      live.id,
      live.prompt,
      live.options,
      live.status,
      live.closes_at as "closesAt",
      live.created_at as "createdAt",
      answer.option_id as "myOption",
      case when live.status in ('resolved', 'void') then live.correct_option else null end as "correctOption",
      tx.points,
      public.pulse_cfg_int('LIVE_POINTS') as "livePoints",
      case
        when answer.option_id is null then null
        when (select count(*) from public.pulse_live_answers where question_id = live.id) < minimum then jsonb_build_object('hidden', true)
        else jsonb_build_object(
          'total', (select count(*) from public.pulse_live_answers where question_id = live.id),
          'options', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', choice.id,
              'label', choice.label,
              'percent', round(100.0 * (
                select count(*) from public.pulse_live_answers ans
                where ans.question_id = live.id and ans.option_id = choice.id
              ) / nullif((select count(*) from public.pulse_live_answers where question_id = live.id), 0))
            )), '[]'::jsonb)
            from jsonb_to_recordset(live.options) as choice(id text, label text)
          )
        )
      end as share
    from public.pulse_live_questions live
    left join public.pulse_live_answers answer on answer.question_id = live.id and answer.user_id = uid
    left join public.pulse_transactions tx on tx.source_type = 'live_answer' and tx.source_id = answer.id
    where live.match_id = match.id
      and (live.status = 'open' or live.created_at > now() - interval '18 hours')
  ) q;

  return jsonb_build_object(
    'ok', true,
    'match', jsonb_build_object(
      'id', match.id,
      'awayTeam', match.away_team,
      'homeTeam', match.home_team,
      'homeScore', match.home_score,
      'awayScore', match.away_score,
      'inning', match.inning,
      'half', match.half,
      'status', match.status,
      'simulation', match.is_simulation,
      'startsAt', match.starts_at
    ),
    'prediction', case when pred.id is null then null else jsonb_build_object(
      'winner', pred.predicted_winner,
      'homeScore', pred.predicted_home_score,
      'awayScore', pred.predicted_away_score
    ) end,
    'closeness', breakdown || jsonb_build_object('mood', mood),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'inning', event.inning,
        'half', event.half,
        'type', event.event_type,
        'description', event.description,
        'homeScore', event.home_score_after,
        'awayScore', event.away_score_after,
        'createdAt', event.created_at
      ) order by event.created_at desc)
      from public.pulse_match_events event
      where event.match_id = match.id
    ), '[]'::jsonb),
    'bingo', jsonb_build_object(
      'points', coalesce((
        select sum(tx.points)
        from public.pulse_transactions tx
        where tx.user_id = uid
          and tx.source_type = 'bingo'
          and tx.metadata->>'matchId' = match.id
      ), 0),
      'picks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pick.pick_id,
          'label', coalesce(catalog.label, pick.pick_id),
          'resolvedAt', hit.resolved_at
        ) order by pick.ordinality)
        from public.pulse_bingo_cards card
        cross join lateral unnest(card.picks) with ordinality as pick(pick_id, ordinality)
        left join public.pulse_bingo_events catalog on catalog.id = pick.pick_id
        left join public.pulse_bingo_hits hit
          on hit.match_id = match.id and hit.user_id = uid and hit.pick_id = pick.pick_id
        where card.match_id = match.id and card.user_id = uid
      ), '[]'::jsonb)
    ),
    'live', coalesce(question, '[]'::jsonb),
    'winnerShare', case
      when match.status not in ('scheduled', 'postponed') or match.starts_at <= now() then null
      when pick_total < minimum then jsonb_build_object('hidden', true, 'total', pick_total)
      else jsonb_build_object(
        'total', pick_total,
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'team', side.team,
            'percent', round(100.0 * side.votes / pick_total)
          )), '[]'::jsonb)
          from (
            select predicted_winner as team, count(*) as votes
            from public.pulse_match_predictions
            where match_id = match.id
            group by predicted_winner
          ) side
        )
      )
    end,
    'duels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', duel.id,
        'status', duel.status,
        'opponent', other.alias,
        'mine', case when duel.challenger_id = uid then duel.challenger_points else duel.opponent_points end,
        'theirs', case when duel.challenger_id = uid then duel.opponent_points else duel.challenger_points end,
        'iWon', duel.winner_user_id = uid,
        'tie', duel.status = 'resolved' and duel.winner_user_id is null
      ))
      from public.pulse_duels duel
      join public.pulse_profiles other on other.id = case when duel.challenger_id = uid then duel.opponent_id else duel.challenger_id end
      where duel.match_id = match.id and (duel.challenger_id = uid or duel.opponent_id = uid)
    ), '[]'::jsonb)
  );
end;
$$;

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
  perform public.pulse_resolve_duels(match.id);
  return jsonb_build_object('ok', true, 'scored', scored, 'points', awarded);
end;
$$;

create or replace function public.pulse_award_plenos(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  games integer;
  finished integer;
  bonus integer := public.pulse_cfg_int('PLENO_BONUS');
  sample text;
  usr record;
  correct integer;
  predicted integer;
  source text;
begin
  if p_day is null then
    return;
  end if;
  select count(*), count(*) filter (where status = 'finished')
    into games, finished
  from public.pulse_matches
  where (starts_at at time zone 'America/Caracas')::date = p_day
    and status <> 'cancelled'
    and id not like 'sim_%';
  if games < 2 or finished < games then
    return;
  end if;
  select id into sample
  from public.pulse_matches
  where (starts_at at time zone 'America/Caracas')::date = p_day
    and status = 'finished'
    and id not like 'sim_%'
  limit 1;
  for usr in select id from public.pulse_profiles loop
    select count(*) into predicted
    from public.pulse_match_predictions pred
    join public.pulse_matches match on match.id = pred.match_id
    where pred.user_id = usr.id
      and (match.starts_at at time zone 'America/Caracas')::date = p_day
      and match.status = 'finished'
      and match.id not like 'sim_%';
    select count(*) into correct
    from public.pulse_match_predictions pred
    join public.pulse_matches match on match.id = pred.match_id
    where pred.user_id = usr.id
      and (match.starts_at at time zone 'America/Caracas')::date = p_day
      and match.status = 'finished'
      and match.id not like 'sim_%'
      and pred.predicted_winner = case
        when match.home_score > match.away_score then match.home_team
        else match.away_team
      end;
    source := 'pleno:' || usr.id || ':' || p_day::text;
    if predicted = games and correct = games then
      perform public.pulse_credit(
        usr.id, 'pleno', source, bonus,
        jsonb_build_object('earnedOn', p_day, 'matchId', sample)
      );
      perform public.pulse_log_event('pleno_awarded', usr.id, null, source, jsonb_build_object('day', p_day));
    else
      perform public.pulse_credit(usr.id, 'pleno', source, 0, '{}'::jsonb);
    end if;
  end loop;
end;
$$;

create or replace function public.pulse_pleno_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  today date := public.pulse_caracas_today();
  games integer;
  predicted integer;
  correct integer;
  pending integer;
  wrong integer;
  bonus integer := public.pulse_cfg_int('PLENO_BONUS');
  awarded boolean;
begin
  uid := public.pulse_user_id(p_token);
  select count(*) into games
  from public.pulse_matches
  where (starts_at at time zone 'America/Caracas')::date = today
    and status <> 'cancelled'
    and id not like 'sim_%';
  if uid is null or games < 2 then
    return jsonb_build_object('games', coalesce(games, 0), 'show', false);
  end if;
  select
    count(pred.id),
    count(*) filter (where match.status = 'finished' and pred.predicted_winner = case when match.home_score > match.away_score then match.home_team else match.away_team end),
    count(*) filter (where match.status <> 'finished'),
    count(*) filter (where match.status = 'finished' and pred.predicted_winner <> case when match.home_score > match.away_score then match.home_team else match.away_team end)
  into predicted, correct, pending, wrong
  from public.pulse_matches match
  left join public.pulse_match_predictions pred on pred.match_id = match.id and pred.user_id = uid
  where (match.starts_at at time zone 'America/Caracas')::date = today
    and match.status <> 'cancelled'
    and match.id not like 'sim_%';
  select exists (
    select 1 from public.pulse_transactions
    where source_type = 'pleno' and source_id = 'pleno:' || uid || ':' || today::text and points > 0
  ) into awarded;
  return jsonb_build_object(
    'show', true,
    'games', games,
    'predicted', predicted,
    'correct', correct,
    'possible', predicted = games and wrong = 0,
    'awarded', awarded,
    'bonus', bonus
  );
end;
$$;

grant execute on function public.pulse_admin_open_live(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_add_event(text, text, integer, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.pulse_duel_challenge(text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_sim_start(text, text, integer) to anon, authenticated;
grant execute on function public.pulse_admin_sim_stop(text) to anon, authenticated;
grant execute on function public.pulse_admin_sim_status(text) to anon, authenticated;
grant execute on function public.pulse_match_center(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_set_result(text, text, integer, integer) to anon, authenticated;

create or replace function public.pulse_ranking(p_token text, p_cycle text default 'lifetime')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  c_start date;
  c_end date;
begin
  uid := public.pulse_user_id(p_token);
  if p_cycle is null or p_cycle = 'lifetime' then
    c_start := null;
    c_end := null;
  else
    select starts_on, ends_on into c_start, c_end
    from public.pulse_cycles
    where id = p_cycle;
    if c_start is null then
      return '[]'::jsonb;
    end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', ranked.position,
      'points', ranked.points,
      'lifetimePoints', ranked.lifetime_points,
      'isCurrentUser', ranked.id = uid,
      'user', jsonb_build_object(
        'id', ranked.id,
        'alias', ranked.alias,
        'handle', ranked.handle,
        'initials', ranked.initials,
        'avatarColor', ranked.avatar_color
      )
    ) order by ranked.position)
    from (
      select
        profile.id,
        profile.alias,
        profile.handle,
        profile.initials,
        profile.avatar_color,
        coalesce(sum(tx.points) filter (
          where c_start is null
             or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end
        ), 0)::int as points,
        coalesce(sum(tx.points), 0)::int as lifetime_points,
        coalesce(sum(tx.points) filter (
          where tx.source_type = 'prediction'
            and (c_start is null or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end)
        ), 0)::int as prediction_points,
        count(*) filter (
          where tx.source_type = 'prediction'
            and (tx.metadata->>'errorTotal')::int = 0
            and (c_start is null or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end)
        )::int as exacts,
        count(*) filter (
          where tx.source_type = 'prediction'
            and (tx.metadata->>'winnerPoints')::int = 40
            and (c_start is null or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end)
        )::int as winners,
        (
          select max(pred.updated_at)
          from public.pulse_match_predictions pred
          join public.pulse_matches pred_match on pred_match.id = pred.match_id
          where pred.user_id = profile.id
            and pred_match.id not like 'sim_%'
            and (
              c_start is null
              or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end
            )
        ) as last_prediction_at,
        row_number() over (
          order by
            coalesce(sum(tx.points) filter (
              where c_start is null
                 or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end
            ), 0) desc,
            coalesce(sum(tx.points) filter (
              where tx.source_type = 'prediction'
                and (c_start is null or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end)
            ), 0) desc,
            count(*) filter (
              where tx.source_type = 'prediction'
                and (tx.metadata->>'errorTotal')::int = 0
                and (c_start is null or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end)
            ) desc,
            count(*) filter (
              where tx.source_type = 'prediction'
                and (tx.metadata->>'winnerPoints')::int = 40
                and (c_start is null or coalesce((match.starts_at at time zone 'America/Caracas')::date, nullif(tx.metadata->>'earnedOn','')::date) between c_start and c_end)
            ) desc,
            (
              select max(pred.updated_at)
              from public.pulse_match_predictions pred
              join public.pulse_matches pred_match on pred_match.id = pred.match_id
              where pred.user_id = profile.id
            and pred_match.id not like 'sim_%'
                and (
                  c_start is null
                  or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end
                )
            ) asc nulls last,
            profile.alias asc
        ) as position
      from public.pulse_profiles profile
      left join public.pulse_transactions tx on tx.user_id = profile.id and coalesce(tx.metadata->>'matchId', '') not like 'sim_%'
      left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
      group by profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color
    ) ranked
  ), '[]'::jsonb);
end;
$$;

-- The home board lists open questions. A practice game must not show up there.
create or replace function public.pulse_live_payload(p_user text, p_match text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'matchId', q.match_id,
    'prompt', q.prompt,
    'options', q.options,
    'status', q.status,
    'closesAt', q.closes_at,
    'myOption', a.option_id,
    'correctOption', case when q.status in ('resolved', 'void') then q.correct_option else null end,
    'points', tx.points,
    'awayTeam', m.away_team,
    'homeTeam', m.home_team,
    'livePoints', public.pulse_cfg_int('LIVE_POINTS')
  ) order by q.created_at desc), '[]'::jsonb)
  from public.pulse_live_questions q
  join public.pulse_matches m on m.id = q.match_id
  left join public.pulse_live_answers a on a.question_id = q.id and a.user_id = p_user
  left join public.pulse_transactions tx on tx.source_type = 'live_answer' and tx.source_id = a.id
  where (p_match is null or q.match_id = p_match)
    and (p_match is not null or m.is_simulation = false)
    and (
      q.status = 'open'
      or (q.status in ('resolved', 'closed', 'void') and q.created_at > now() - interval '18 hours')
    );
$$;

