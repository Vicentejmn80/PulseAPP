-- October pilot extras: QR, live questions, bingo, pleno, streaks, flash.
-- Points always land in pulse_transactions. Day boundaries use America/Caracas.

create table if not exists public.pulse_pilot_config (
  key text primary key,
  value jsonb not null
);

insert into public.pulse_pilot_config (key, value) values
  ('LIVE_POINTS', '10'),
  ('BINGO_EVENT_POINTS', '5'),
  ('BINGO_FULL_BONUS', '15'),
  ('PLENO_BONUS', '30'),
  ('FLASH_POINTS', '10'),
  ('QR_POINTS', '3'),
  ('FLASH_MINUTES', '5'),
  ('STREAK_MILESTONES', '{"3":5,"5":10,"7":15,"10":25}')
on conflict (key) do nothing;

create or replace function public.pulse_cfg_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (value #>> '{}')::integer from public.pulse_pilot_config where key = p_key;
$$;

create or replace function public.pulse_caracas_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Caracas')::date;
$$;

alter table public.pulse_venues
  add column if not exists qr_token text,
  add column if not exists broadcasts text not null default '';

create unique index if not exists pulse_venues_qr_token_key on public.pulse_venues (qr_token);

update public.pulse_venues
set qr_token = 'q' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
where qr_token is null;

create or replace function public.pulse_venue_ensure_qr()
returns trigger
language plpgsql
as $$
begin
  if new.qr_token is null or new.qr_token = '' then
    new.qr_token := 'q' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_venue_ensure_qr on public.pulse_venues;
create trigger pulse_venue_ensure_qr
before insert on public.pulse_venues
for each row execute function public.pulse_venue_ensure_qr();

create table if not exists public.pulse_activity_events (
  id text primary key,
  event_type text not null,
  user_id text references public.pulse_profiles (id) on delete cascade,
  venue_id text references public.pulse_venues (id) on delete set null,
  dedupe_key text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (event_type, dedupe_key)
);

create table if not exists public.pulse_play_days (
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  played_on date not null,
  primary key (user_id, played_on)
);

create table if not exists public.pulse_qr_scans (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  venue_id text not null references public.pulse_venues (id) on delete cascade,
  scan_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, venue_id, scan_date)
);

create table if not exists public.pulse_live_questions (
  id text primary key,
  match_id text not null references public.pulse_matches (id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  status text not null default 'open' check (status in ('open', 'closed', 'resolved', 'void')),
  correct_option text,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.pulse_live_answers (
  id text primary key,
  question_id text not null references public.pulse_live_questions (id) on delete cascade,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);

create table if not exists public.pulse_bingo_events (
  id text primary key,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.pulse_bingo_events (id, label, sort_order) values
  ('jonron', 'Jonrón', 1),
  ('ponche', 'Ponche', 2),
  ('doble_play', 'Doble play', 3),
  ('base_robada', 'Base robada', 4),
  ('error', 'Error', 5),
  ('bases_llenas', 'Bases llenas', 6),
  ('triple', 'Triple', 7),
  ('sacrificio', 'Sacrificio', 8),
  ('carrera_1er', 'Carrera en el 1er inning', 9),
  ('extra_innings', 'Extra innings', 10),
  ('cerrado_1', 'Cerrado por 1 carrera', 11),
  ('blanqueada', 'Blanqueada', 12)
on conflict (id) do nothing;

create table if not exists public.pulse_bingo_cards (
  id text primary key,
  match_id text not null references public.pulse_matches (id) on delete cascade,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  picks text[] not null,
  updated_at timestamptz not null default now(),
  unique (match_id, user_id),
  check (cardinality(picks) = 5)
);

create table if not exists public.pulse_bingo_results (
  match_id text primary key references public.pulse_matches (id) on delete cascade,
  occurred text[] not null default '{}',
  status text not null default 'closed' check (status in ('closed', 'void')),
  closed_at timestamptz not null default now()
);

create table if not exists public.pulse_flash_questions (
  id text primary key,
  venue_id text references public.pulse_venues (id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  status text not null default 'open' check (status in ('open', 'closed', 'resolved', 'void')),
  correct_option text,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.pulse_flash_answers (
  id text primary key,
  question_id text not null references public.pulse_flash_questions (id) on delete cascade,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  venue_id text references public.pulse_venues (id) on delete set null,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);

alter table public.pulse_activity_events enable row level security;
alter table public.pulse_play_days enable row level security;
alter table public.pulse_qr_scans enable row level security;
alter table public.pulse_live_questions enable row level security;
alter table public.pulse_live_answers enable row level security;
alter table public.pulse_bingo_events enable row level security;
alter table public.pulse_bingo_cards enable row level security;
alter table public.pulse_bingo_results enable row level security;
alter table public.pulse_flash_questions enable row level security;
alter table public.pulse_flash_answers enable row level security;
alter table public.pulse_pilot_config enable row level security;

create or replace function public.pulse_log_event(
  p_type text,
  p_user text,
  p_venue text,
  p_dedupe text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pulse_activity_events (id, event_type, user_id, venue_id, dedupe_key, metadata)
  values (
    'evt_' || replace(gen_random_uuid()::text, '-', ''),
    p_type, p_user, p_venue, p_dedupe, coalesce(p_meta, '{}'::jsonb)
  )
  on conflict (event_type, dedupe_key) do nothing;
end;
$$;

create or replace function public.pulse_credit(
  p_user text,
  p_source_type text,
  p_source_id text,
  p_points integer,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_points, 0) <= 0 then
    delete from public.pulse_transactions
    where source_type = p_source_type and source_id = p_source_id;
    return;
  end if;
  insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
  values (
    'tx_' || md5(p_source_type || ':' || p_source_id),
    p_user,
    'exp_tobo',
    p_source_type,
    p_source_id,
    p_points,
    coalesce(p_meta, '{}'::jsonb)
  )
  on conflict (source_type, source_id) do update
  set points = excluded.points,
      metadata = excluded.metadata
  where public.pulse_transactions.points is distinct from excluded.points
     or public.pulse_transactions.metadata is distinct from excluded.metadata;
end;
$$;

create or replace function public.pulse_streak_length(p_user text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := public.pulse_caracas_today();
  days date[];
  i integer;
  d date;
  len integer := 0;
begin
  select coalesce(array_agg(day order by day), '{}') into days
  from (
    select distinct (starts_at at time zone 'America/Caracas')::date as day
    from public.pulse_matches
    where status <> 'cancelled'
      and (starts_at at time zone 'America/Caracas')::date <= today
  ) game_days;

  if days is null or array_length(days, 1) is null then
    return 0;
  end if;

  for i in reverse array_length(days, 1)..1 loop
    d := days[i];
    if d = today and not exists (
      select 1 from public.pulse_play_days where user_id = p_user and played_on = d
    ) then
      continue;
    end if;
    if exists (select 1 from public.pulse_play_days where user_id = p_user and played_on = d) then
      len := len + 1;
    else
      exit;
    end if;
  end loop;
  return len;
end;
$$;

create or replace function public.pulse_streak_start(p_user text)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := public.pulse_caracas_today();
  days date[];
  i integer;
  d date;
  started date;
begin
  select coalesce(array_agg(day order by day), '{}') into days
  from (
    select distinct (starts_at at time zone 'America/Caracas')::date as day
    from public.pulse_matches
    where status <> 'cancelled'
      and (starts_at at time zone 'America/Caracas')::date <= today
  ) game_days;
  if days is null or array_length(days, 1) is null then
    return null;
  end if;
  for i in reverse array_length(days, 1)..1 loop
    d := days[i];
    if d = today and not exists (
      select 1 from public.pulse_play_days where user_id = p_user and played_on = d
    ) then
      continue;
    end if;
    if exists (select 1 from public.pulse_play_days where user_id = p_user and played_on = d) then
      started := d;
    else
      exit;
    end if;
  end loop;
  return started;
end;
$$;

create or replace function public.pulse_sync_streak(p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  len integer;
  started date;
  milestones jsonb;
  rec record;
  source text;
begin
  len := public.pulse_streak_length(p_user);
  started := public.pulse_streak_start(p_user);
  if len <= 0 or started is null then
    return;
  end if;
  select value into milestones from public.pulse_pilot_config where key = 'STREAK_MILESTONES';
  for rec in
    select entry.key as milestone, entry.value::integer as bonus
    from jsonb_each_text(milestones) entry
  loop
    if len >= rec.milestone::integer then
      source := 'streak:' || p_user || ':' || started::text || ':' || rec.milestone;
      perform public.pulse_credit(
        p_user, 'streak', source, rec.bonus,
        jsonb_build_object('earnedOn', public.pulse_caracas_today(), 'milestone', rec.milestone::integer, 'streakStart', started)
      );
      perform public.pulse_log_event('streak_milestone', p_user, null, source, jsonb_build_object('milestone', rec.milestone::integer));
    end if;
  end loop;
end;
$$;

create or replace function public.pulse_mark_play_day(p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  insert into public.pulse_play_days (user_id, played_on)
  values (p_user, public.pulse_caracas_today())
  on conflict do nothing;
  perform public.pulse_sync_streak(p_user);
end;
$$;

create or replace function public.pulse_prediction_play_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.predicted_winner is not distinct from old.predicted_winner
     and new.predicted_home_score is not distinct from old.predicted_home_score
     and new.predicted_away_score is not distinct from old.predicted_away_score then
    return new;
  end if;
  perform public.pulse_mark_play_day(new.user_id);
  return new;
end;
$$;

drop trigger if exists pulse_prediction_play_day on public.pulse_match_predictions;
create trigger pulse_prediction_play_day
after insert or update on public.pulse_match_predictions
for each row execute function public.pulse_prediction_play_day();

create or replace function public.pulse_my_streak(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  len integer;
  milestones jsonb;
  next_need integer;
  next_bonus integer;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object(
      'length', 0,
      'nextDays', 3,
      'nextPoints', (
        select entry.value::integer
        from jsonb_each_text((select value from public.pulse_pilot_config where key = 'STREAK_MILESTONES')) entry
        where entry.key = '3'
      )
    );
  end if;
  perform public.pulse_sync_streak(uid);
  len := public.pulse_streak_length(uid);
  select value into milestones from public.pulse_pilot_config where key = 'STREAK_MILESTONES';
  select entry.key::integer, entry.value::integer
    into next_need, next_bonus
  from jsonb_each_text(milestones) entry
  where entry.key::integer > len
  order by entry.key::integer
  limit 1;
  return jsonb_build_object(
    'length', len,
    'nextDays', case when next_need is null then null else next_need - len end,
    'nextPoints', next_bonus
  );
end;
$$;

-- QR
create or replace function public.pulse_qr_visit(p_token text, p_qr text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  venue public.pulse_venues;
  today date := public.pulse_caracas_today();
  already boolean := false;
  points integer := public.pulse_cfg_int('QR_POINTS');
  source text;
  flash jsonb;
begin
  perform public.pulse_close_due_flash();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para registrar tu visita.');
  end if;
  select * into venue from public.pulse_venues where qr_token = trim(coalesce(p_qr, '')) and active;
  if venue.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese código no corresponde a una tasca.');
  end if;

  insert into public.pulse_qr_scans (id, user_id, venue_id, scan_date)
  values ('scan_' || replace(gen_random_uuid()::text, '-', ''), uid, venue.id, today)
  on conflict (user_id, venue_id, scan_date) do nothing;
  already := not found;

  if not already then
    source := 'qr:' || uid || ':' || venue.id || ':' || today::text;
    perform public.pulse_credit(uid, 'qr_scan', source, points, jsonb_build_object('earnedOn', today, 'venueId', venue.id));
    perform public.pulse_log_event('qr_scan_credited', uid, venue.id, source, '{}'::jsonb);
    perform public.pulse_mark_play_day(uid);
  end if;

  select jsonb_build_object(
    'id', q.id,
    'prompt', q.prompt,
    'options', q.options,
    'closesAt', q.closes_at,
    'status', q.status,
    'myOption', a.option_id,
    'correctOption', case when q.status in ('resolved', 'void') then q.correct_option else null end,
    'points', public.pulse_cfg_int('FLASH_POINTS')
  ) into flash
  from public.pulse_flash_questions q
  left join public.pulse_flash_answers a on a.question_id = q.id and a.user_id = uid
  where q.status = 'open'
    and q.opens_at <= now()
    and q.closes_at > now()
    and (q.venue_id is null or q.venue_id = venue.id)
  order by q.closes_at
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'already', already,
    'points', case when already then 0 else points end,
    'venue', jsonb_build_object(
      'id', venue.id,
      'name', venue.name,
      'zone', venue.zone,
      'address', venue.address,
      'contact', venue.contact,
      'broadcasts', venue.broadcasts,
      'isFounder', venue.is_founder
    ),
    'flash', flash
  );
end;
$$;

create or replace function public.pulse_admin_rotate_qr(p_admin_key text, p_venue_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token text;
begin
  perform public.pulse_require_admin(p_admin_key);
  token := 'q' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  update public.pulse_venues set qr_token = token where id = p_venue_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No encontré esa tasca.');
  end if;
  return jsonb_build_object('ok', true, 'qrToken', token);
end;
$$;

create or replace function public.pulse_admin_set_broadcasts(p_admin_key text, p_venue_id text, p_broadcasts text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_venues set broadcasts = trim(coalesce(p_broadcasts, '')) where id = p_venue_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No encontré esa tasca.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_venues(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'zone', zone,
      'qrToken', qr_token,
      'broadcasts', broadcasts,
      'isFounder', is_founder
    ) order by name)
    from public.pulse_venues
    where active
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_venues_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'zone', zone,
    'address', address,
    'contact', contact,
    'broadcasts', broadcasts,
    'isFounder', is_founder
  ) order by is_founder desc, name), '[]'::jsonb)
  from public.pulse_venues
  where active;
$$;

-- Live questions
create or replace function public.pulse_close_due_live()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pulse_live_questions
  set status = 'closed'
  where status = 'open' and closes_at is not null and closes_at <= now();
end;
$$;

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
    and (
      q.status = 'open'
      or (q.status in ('resolved', 'closed', 'void') and q.created_at > now() - interval '18 hours')
    );
$$;

create or replace function public.pulse_admin_live_create(
  p_admin_key text,
  p_match_id text,
  p_kind text,
  p_inning integer,
  p_prompt text,
  p_labels jsonb,
  p_closes_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  prompt text;
  options jsonb;
  new_id text;
  label text;
  i integer := 0;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into match from public.pulse_matches where id = p_match_id;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if p_kind = 'runs' then
    if p_inning is null or p_inning < 1 or p_inning > 20 then
      return jsonb_build_object('ok', false, 'error', 'Indica el inning.');
    end if;
    prompt := '¿Anotan carreras en el inning ' || p_inning || '?';
    options := '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb;
  elsif p_kind = 'homer' then
    if p_inning is null or p_inning < 1 or p_inning > 20 then
      return jsonb_build_object('ok', false, 'error', 'Indica el inning.');
    end if;
    prompt := '¿Hay jonrón en el inning ' || p_inning || '?';
    options := '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb;
  elsif p_kind = 'first' then
    prompt := '¿Quién anota primero?';
    options := jsonb_build_array(
      jsonb_build_object('id', 'visitante', 'label', match.away_team),
      jsonb_build_object('id', 'local', 'label', match.home_team),
      jsonb_build_object('id', 'nadie', 'label', 'Nadie')
    );
  elsif p_kind = 'free' then
    prompt := trim(coalesce(p_prompt, ''));
    if length(prompt) < 4 then
      return jsonb_build_object('ok', false, 'error', 'Escribe la pregunta.');
    end if;
    options := '[]'::jsonb;
    if jsonb_typeof(p_labels) <> 'array' or jsonb_array_length(p_labels) < 2 or jsonb_array_length(p_labels) > 4 then
      return jsonb_build_object('ok', false, 'error', 'La pregunta libre necesita de 2 a 4 opciones.');
    end if;
    for label in select jsonb_array_elements_text(p_labels) loop
      i := i + 1;
      if length(trim(label)) < 1 then
        return jsonb_build_object('ok', false, 'error', 'Hay una opción vacía.');
      end if;
      options := options || jsonb_build_array(jsonb_build_object('id', 'opt' || i, 'label', trim(label)));
    end loop;
  else
    return jsonb_build_object('ok', false, 'error', 'Elige una plantilla.');
  end if;

  new_id := 'live_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_live_questions (id, match_id, prompt, options, closes_at)
  values (new_id, match.id, prompt, options, p_closes_at);
  return jsonb_build_object('ok', true, 'id', new_id);
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
begin
  perform public.pulse_close_due_live();
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
  perform public.pulse_mark_play_day(uid);
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Ya respondiste esta pregunta.');
end;
$$;

create or replace function public.pulse_admin_live_close(p_admin_key text, p_question text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_live_questions set status = 'closed' where id = p_question and status = 'open';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta ya no está abierta.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_live_resolve(p_admin_key text, p_question text, p_option text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.pulse_live_questions;
  match public.pulse_matches;
  ans record;
  awarded integer := 0;
  points integer := public.pulse_cfg_int('LIVE_POINTS');
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into q from public.pulse_live_questions where id = p_question for update;
  if q.id is null or q.status = 'void' then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no se puede resolver.');
  end if;
  if not exists (select 1 from jsonb_array_elements(q.options) opt where opt->>'id' = p_option) then
    return jsonb_build_object('ok', false, 'error', 'Esa no es una opción de la pregunta.');
  end if;
  select * into match from public.pulse_matches where id = q.match_id;
  update public.pulse_live_questions
  set status = 'resolved', correct_option = p_option, resolved_at = now()
  where id = q.id;
  for ans in select * from public.pulse_live_answers where question_id = q.id loop
    if ans.option_id = p_option then
      perform public.pulse_credit(
        ans.user_id, 'live_answer', ans.id, points,
        jsonb_build_object(
          'earnedOn', (match.starts_at at time zone 'America/Caracas')::date,
          'matchId', match.id,
          'matchStartsAt', match.starts_at
        )
      );
      awarded := awarded + 1;
    else
      perform public.pulse_credit(ans.user_id, 'live_answer', ans.id, 0, '{}'::jsonb);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'awarded', awarded);
end;
$$;

create or replace function public.pulse_admin_live_void(p_admin_key text, p_question text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ans record;
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_live_questions
  set status = 'void', resolved_at = now()
  where id = p_question and status <> 'void';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no existe.');
  end if;
  for ans in select id, user_id from public.pulse_live_answers where question_id = p_question loop
    perform public.pulse_credit(ans.user_id, 'live_answer', ans.id, 0, '{}'::jsonb);
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

-- Bingo
create or replace function public.pulse_bingo_payload(p_user text, p_match text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  card public.pulse_bingo_cards;
  result public.pulse_bingo_results;
  locked boolean;
  tx_points integer;
begin
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return '{}'::jsonb;
  end if;
  select * into card from public.pulse_bingo_cards where match_id = p_match and user_id = p_user;
  select * into result from public.pulse_bingo_results where match_id = p_match;
  locked := match.status in ('locked', 'finished', 'cancelled') or match.starts_at <= now() or result.status is not null;
  select points into tx_points
  from public.pulse_transactions tx
  where tx.source_type = 'bingo' and tx.source_id = 'bingo:' || p_match || ':' || coalesce(p_user, '');
  return jsonb_build_object(
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'label', label) order by sort_order)
      from public.pulse_bingo_events where active
    ), '[]'::jsonb),
    'picks', coalesce(to_jsonb(card.picks), 'null'::jsonb),
    'locked', locked,
    'occurred', coalesce(to_jsonb(result.occurred), '[]'::jsonb),
    'status', coalesce(result.status, 'open'),
    'points', tx_points,
    'eventPoints', public.pulse_cfg_int('BINGO_EVENT_POINTS'),
    'fullBonus', public.pulse_cfg_int('BINGO_FULL_BONUS')
  );
end;
$$;

create or replace function public.pulse_bingo_save(p_token text, p_match text, p_picks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  picks text[];
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para armar el bingo.');
  end if;
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status in ('locked', 'finished', 'cancelled') or match.starts_at <= now()
     or exists (select 1 from public.pulse_bingo_results where match_id = match.id) then
    return jsonb_build_object('ok', false, 'error', 'El bingo de este juego ya está cerrado.');
  end if;
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) <> 5 then
    return jsonb_build_object('ok', false, 'error', 'Elige 5 jugadas.');
  end if;
  select coalesce(array_agg(distinct value), '{}') into picks
  from jsonb_array_elements_text(p_picks) value
  where exists (select 1 from public.pulse_bingo_events event where event.id = value and event.active);
  if cardinality(picks) <> 5 then
    return jsonb_build_object('ok', false, 'error', 'Elige 5 jugadas distintas de la lista.');
  end if;
  insert into public.pulse_bingo_cards (id, match_id, user_id, picks)
  values ('bingo_' || replace(gen_random_uuid()::text, '-', ''), match.id, uid, picks)
  on conflict (match_id, user_id) do update
  set picks = excluded.picks, updated_at = now();
  perform public.pulse_log_event(
    'bingo_saved', uid, null,
    'bingo_saved:' || uid || ':' || match.id || ':' || replace(gen_random_uuid()::text, '-', ''),
    jsonb_build_object('matchId', match.id)
  );
  perform public.pulse_mark_play_day(uid);
  return jsonb_build_object('ok', true);
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
  hits integer;
  points integer;
  event_points integer := public.pulse_cfg_int('BINGO_EVENT_POINTS');
  full_bonus integer := public.pulse_cfg_int('BINGO_FULL_BONUS');
  earned date;
begin
  select * into match from public.pulse_matches where id = p_match;
  select * into result from public.pulse_bingo_results where match_id = p_match;
  if match.id is null or result.match_id is null or result.status = 'void' or match.status = 'cancelled' then
    return;
  end if;
  earned := (match.starts_at at time zone 'America/Caracas')::date;
  for card in select * from public.pulse_bingo_cards where match_id = p_match loop
    select count(*) into hits
    from unnest(card.picks) pick
    where pick = any (result.occurred);
    points := hits * event_points + case when hits = 5 then full_bonus else 0 end;
    perform public.pulse_credit(
      card.user_id, 'bingo', 'bingo:' || p_match || ':' || card.user_id, points,
      jsonb_build_object('earnedOn', earned, 'matchId', match.id, 'matchStartsAt', match.starts_at, 'hits', hits)
    );
  end loop;
end;
$$;

create or replace function public.pulse_void_bingo(p_match text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card record;
begin
  insert into public.pulse_bingo_results (match_id, occurred, status)
  values (p_match, '{}', 'void')
  on conflict (match_id) do update set status = 'void', occurred = '{}', closed_at = now();
  for card in select user_id from public.pulse_bingo_cards where match_id = p_match loop
    perform public.pulse_credit(card.user_id, 'bingo', 'bingo:' || p_match || ':' || card.user_id, 0, '{}'::jsonb);
  end loop;
end;
$$;

create or replace function public.pulse_admin_bingo_close(p_admin_key text, p_match text, p_occurred jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  occurred text[];
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status = 'cancelled' then
    perform public.pulse_void_bingo(match.id);
    return jsonb_build_object('ok', true, 'void', true);
  end if;
  select coalesce(array_agg(distinct value), '{}') into occurred
  from jsonb_array_elements_text(coalesce(p_occurred, '[]'::jsonb)) value
  where exists (select 1 from public.pulse_bingo_events event where event.id = value);
  insert into public.pulse_bingo_results (match_id, occurred, status)
  values (match.id, occurred, 'closed')
  on conflict (match_id) do update
  set occurred = excluded.occurred, status = 'closed', closed_at = now();
  perform public.pulse_score_bingo(match.id);
  perform public.pulse_log_event(
    'bingo_resolved', null, null,
    'bingo_resolved:' || match.id || ':' || md5(array_to_string(occurred, ',')),
    jsonb_build_object('matchId', match.id)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_save_bingo_event(
  p_admin_key text,
  p_id text,
  p_label text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if length(trim(coalesce(p_label, ''))) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre de la jugada.');
  end if;
  if coalesce(p_id, '') = '' then
    new_id := 'evt' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    insert into public.pulse_bingo_events (id, label, active, sort_order)
    values (new_id, trim(p_label), coalesce(p_active, true), 100);
  else
    update public.pulse_bingo_events
    set label = trim(p_label), active = coalesce(p_active, active)
    where id = p_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Esa jugada no existe.');
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Pleno
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
    and status <> 'cancelled';
  if games < 2 or finished < games then
    return;
  end if;
  select id into sample
  from public.pulse_matches
  where (starts_at at time zone 'America/Caracas')::date = p_day
    and status = 'finished'
  limit 1;

  for usr in select id from public.pulse_profiles loop
    select count(*) into predicted
    from public.pulse_match_predictions pred
    join public.pulse_matches match on match.id = pred.match_id
    where pred.user_id = usr.id
      and (match.starts_at at time zone 'America/Caracas')::date = p_day
      and match.status = 'finished';
    select count(*) into correct
    from public.pulse_match_predictions pred
    join public.pulse_matches match on match.id = pred.match_id
    where pred.user_id = usr.id
      and (match.starts_at at time zone 'America/Caracas')::date = p_day
      and match.status = 'finished'
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
    and status <> 'cancelled';
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
    and match.status <> 'cancelled';
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
  if new.status is distinct from old.status
     or new.home_score is distinct from old.home_score
     or new.away_score is distinct from old.away_score
     or new.starts_at is distinct from old.starts_at then
    perform public.pulse_award_plenos((old.starts_at at time zone 'America/Caracas')::date);
    perform public.pulse_award_plenos((new.starts_at at time zone 'America/Caracas')::date);
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_match_side_effects on public.pulse_matches;
create trigger pulse_match_side_effects
after update on public.pulse_matches
for each row execute function public.pulse_match_side_effects();

-- Flash
create or replace function public.pulse_close_due_flash()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pulse_flash_questions
  set status = 'closed'
  where status = 'open' and closes_at <= now();
end;
$$;

create or replace function public.pulse_admin_flash_create(
  p_admin_key text,
  p_venue text,
  p_prompt text,
  p_labels jsonb,
  p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  minutes integer;
  options jsonb := '[]'::jsonb;
  label text;
  i integer := 0;
  new_id text;
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_close_due_flash();
  if length(trim(coalesce(p_prompt, ''))) < 4 then
    return jsonb_build_object('ok', false, 'error', 'Escribe la pregunta.');
  end if;
  if p_venue is not null and p_venue <> '' and not exists (select 1 from public.pulse_venues where id = p_venue) then
    return jsonb_build_object('ok', false, 'error', 'Esa tasca no existe.');
  end if;
  if jsonb_typeof(p_labels) <> 'array' or jsonb_array_length(p_labels) < 2 or jsonb_array_length(p_labels) > 4 then
    return jsonb_build_object('ok', false, 'error', 'Necesitas de 2 a 4 opciones.');
  end if;
  for label in select jsonb_array_elements_text(p_labels) loop
    i := i + 1;
    if length(trim(label)) < 1 then
      return jsonb_build_object('ok', false, 'error', 'Hay una opción vacía.');
    end if;
    options := options || jsonb_build_array(jsonb_build_object('id', 'opt' || i, 'label', trim(label)));
  end loop;
  minutes := coalesce(p_minutes, public.pulse_cfg_int('FLASH_MINUTES'));
  if minutes < 1 or minutes > 60 then
    return jsonb_build_object('ok', false, 'error', 'La duración tiene que estar entre 1 y 60 minutos.');
  end if;
  new_id := 'flash_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_flash_questions (id, venue_id, prompt, options, opens_at, closes_at)
  values (
    new_id,
    nullif(p_venue, ''),
    trim(p_prompt),
    options,
    now(),
    now() + make_interval(mins => minutes)
  );
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

create or replace function public.pulse_flash_answer(p_token text, p_question text, p_option text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  q public.pulse_flash_questions;
  venue text;
  today date := public.pulse_caracas_today();
begin
  perform public.pulse_close_due_flash();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para responder.');
  end if;
  select * into q from public.pulse_flash_questions where id = p_question for update;
  if q.id is null or q.status <> 'open' or now() < q.opens_at or now() >= q.closes_at then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta ya no está activa.');
  end if;
  if not exists (select 1 from jsonb_array_elements(q.options) opt where opt->>'id' = p_option) then
    return jsonb_build_object('ok', false, 'error', 'Elige una de las opciones.');
  end if;
  select scan.venue_id into venue
  from public.pulse_qr_scans scan
  where scan.user_id = uid
    and scan.scan_date = today
    and (q.venue_id is null or scan.venue_id = q.venue_id)
  order by scan.created_at desc
  limit 1;
  if venue is null then
    return jsonb_build_object('ok', false, 'error', 'Primero registra tu visita en la tasca.');
  end if;
  insert into public.pulse_flash_answers (id, question_id, user_id, venue_id, option_id)
  values ('fans_' || replace(gen_random_uuid()::text, '-', ''), q.id, uid, venue, p_option);
  perform public.pulse_log_event('flash_answered', uid, venue, q.id || ':' || uid, jsonb_build_object('questionId', q.id));
  perform public.pulse_mark_play_day(uid);
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Ya respondiste esta pregunta.');
end;
$$;

create or replace function public.pulse_admin_flash_resolve(p_admin_key text, p_question text, p_option text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.pulse_flash_questions;
  ans record;
  points integer := public.pulse_cfg_int('FLASH_POINTS');
  awarded integer := 0;
begin
  perform public.pulse_require_admin(p_admin_key);
  select * into q from public.pulse_flash_questions where id = p_question for update;
  if q.id is null or q.status = 'void' then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no se puede resolver.');
  end if;
  if not exists (select 1 from jsonb_array_elements(q.options) opt where opt->>'id' = p_option) then
    return jsonb_build_object('ok', false, 'error', 'Esa no es una opción de la pregunta.');
  end if;
  update public.pulse_flash_questions
  set status = 'resolved', correct_option = p_option, resolved_at = now()
  where id = q.id;
  for ans in select * from public.pulse_flash_answers where question_id = q.id loop
    if ans.option_id = p_option then
      perform public.pulse_credit(
        ans.user_id, 'flash', ans.id, points,
        jsonb_build_object('earnedOn', (q.opens_at at time zone 'America/Caracas')::date, 'venueId', ans.venue_id)
      );
      awarded := awarded + 1;
    else
      perform public.pulse_credit(ans.user_id, 'flash', ans.id, 0, '{}'::jsonb);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'awarded', awarded);
end;
$$;

create or replace function public.pulse_admin_flash_void(p_admin_key text, p_question text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ans record;
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_flash_questions set status = 'void', resolved_at = now() where id = p_question;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no existe.');
  end if;
  for ans in select id, user_id from public.pulse_flash_answers where question_id = p_question loop
    perform public.pulse_credit(ans.user_id, 'flash', ans.id, 0, '{}'::jsonb);
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_flash_list(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_close_due_flash();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'options', q.options,
      'status', q.status,
      'closesAt', q.closes_at,
      'venueId', q.venue_id,
      'correctOption', q.correct_option,
      'total', (select count(*) from public.pulse_flash_answers a where a.question_id = q.id),
      'byVenue', coalesce((
        select jsonb_agg(jsonb_build_object('venue', v.name, 'count', grouped.n))
        from (
          select venue_id, count(*) as n
          from public.pulse_flash_answers
          where question_id = q.id
          group by venue_id
        ) grouped
        left join public.pulse_venues v on v.id = grouped.venue_id
      ), '[]'::jsonb)
    ) order by q.created_at desc)
    from public.pulse_flash_questions q
    where q.created_at > now() - interval '2 days'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_admin_live_list(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_close_due_live();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'matchId', q.match_id,
      'prompt', q.prompt,
      'options', q.options,
      'status', q.status,
      'closesAt', q.closes_at,
      'correctOption', q.correct_option,
      'answers', (select count(*) from public.pulse_live_answers a where a.question_id = q.id),
      'awayTeam', m.away_team,
      'homeTeam', m.home_team
    ) order by q.created_at desc)
    from public.pulse_live_questions q
    join public.pulse_matches m on m.id = q.match_id
    where q.created_at > now() - interval '2 days'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_home_board(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  perform public.pulse_close_due_live();
  uid := public.pulse_user_id(p_token);
  return jsonb_build_object(
    'live', public.pulse_live_payload(uid, null),
    'pleno', public.pulse_pleno_status(p_token),
    'streak', public.pulse_my_streak(p_token)
  );
end;
$$;

create or replace function public.pulse_match_board(p_token text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  perform public.pulse_close_due_live();
  uid := public.pulse_user_id(p_token);
  return jsonb_build_object(
    'live', public.pulse_live_payload(uid, p_match),
    'bingo', public.pulse_bingo_payload(uid, p_match)
  );
end;
$$;

create or replace function public.pulse_admin_mechanics_summary(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('type', event_type, 'count', n) order by event_type)
      from (
        select event_type, count(*) as n
        from public.pulse_activity_events
        group by event_type
      ) grouped
    ), '[]'::jsonb),
    'scans', coalesce((
      select jsonb_agg(jsonb_build_object('venue', v.name, 'count', n) order by n desc)
      from (
        select venue_id, count(*) as n
        from public.pulse_qr_scans
        group by venue_id
      ) grouped
      join public.pulse_venues v on v.id = grouped.venue_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Cycle totals include points that are not tied to a game, using earnedOn.
-- Tie-break order is unchanged: prediction points, exact scores, correct winners, then earlier prediction.
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
                and (
                  c_start is null
                  or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end
                )
            ) asc nulls last,
            profile.alias asc
        ) as position
      from public.pulse_profiles profile
      left join public.pulse_transactions tx on tx.user_id = profile.id
      left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
      group by profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color
    ) ranked
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.pulse_qr_visit(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_rotate_qr(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_set_broadcasts(text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_venues(text) to anon, authenticated;
grant execute on function public.pulse_live_answer(text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_live_create(text, text, text, integer, text, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.pulse_admin_live_close(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_live_resolve(text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_live_void(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_live_list(text) to anon, authenticated;
grant execute on function public.pulse_bingo_save(text, text, jsonb) to anon, authenticated;
grant execute on function public.pulse_admin_bingo_close(text, text, jsonb) to anon, authenticated;
grant execute on function public.pulse_admin_save_bingo_event(text, text, text, boolean) to anon, authenticated;
grant execute on function public.pulse_admin_flash_create(text, text, text, jsonb, integer) to anon, authenticated;
grant execute on function public.pulse_flash_answer(text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_flash_resolve(text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_flash_void(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_flash_list(text) to anon, authenticated;
grant execute on function public.pulse_home_board(text) to anon, authenticated;
grant execute on function public.pulse_match_board(text, text) to anon, authenticated;
grant execute on function public.pulse_my_streak(text) to anon, authenticated;
grant execute on function public.pulse_admin_mechanics_summary(text) to anon, authenticated;
grant execute on function public.pulse_ranking(text, text) to anon, authenticated;
