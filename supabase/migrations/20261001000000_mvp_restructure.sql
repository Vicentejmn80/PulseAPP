-- MVP restructure: private leagues, trivia library, prize cycles, analytics.
-- Adds new tables and RPCs without modifying existing Tobo prediction/ranking logic.

-- ============================================================
-- 1. PRIVATE LEAGUES
-- ============================================================

create table if not exists public.pulse_leagues (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  code text not null unique,
  owner_user_id text not null references public.pulse_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.pulse_leagues is 'Private user leagues for friendly competition.';

alter table public.pulse_leagues enable row level security;

create table if not exists public.pulse_league_members (
  league_id text not null references public.pulse_leagues(id) on delete cascade,
  user_id text not null references public.pulse_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

comment on table public.pulse_league_members is 'Many-to-many membership between users and leagues.';

alter table public.pulse_league_members enable row level security;

create table if not exists public.pulse_league_invites (
  code text primary key,
  league_id text not null references public.pulse_leagues(id) on delete cascade,
  max_uses integer not null default 100,
  used_count integer not null default 0,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.pulse_league_invites is 'Reusable invite codes for leagues.';

alter table public.pulse_league_invites enable row level security;

-- ============================================================
-- 2. TRIVIA LIBRARY
-- ============================================================

create table if not exists public.pulse_trivia_questions (
  id text primary key default gen_random_uuid()::text,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_option text not null,
  explanation text null,
  category text not null default 'general',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  status text not null default 'draft' check (status in ('draft','active','disabled')),
  publish_date date null,
  points integer not null default 5,
  created_at timestamptz not null default now(),
  created_by text null references public.pulse_profiles(id) on delete set null
);

comment on table public.pulse_trivia_questions is 'Standalone trivia question library, not tied to a match.';

alter table public.pulse_trivia_questions enable row level security;

create table if not exists public.pulse_trivia_answers (
  question_id text not null references public.pulse_trivia_questions(id) on delete cascade,
  user_id text not null references public.pulse_profiles(id) on delete cascade,
  option_id text not null,
  is_correct boolean not null,
  points integer not null default 0,
  publish_date date not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id, publish_date)
);

comment on table public.pulse_trivia_answers is 'User answers to standalone trivia questions.';

alter table public.pulse_trivia_answers enable row level security;

-- ============================================================
-- 3. PRIZE WINNERS & REDEMPTIONS
-- ============================================================

create table if not exists public.pulse_prize_winners (
  id text primary key default gen_random_uuid()::text,
  cycle_id text not null references public.pulse_cycles(id) on delete cascade,
  prize_id text not null references public.pulse_prizes(id) on delete cascade,
  user_id text not null references public.pulse_profiles(id) on delete cascade,
  rank_slot integer not null,
  awarded_at timestamptz not null default now()
);

comment on table public.pulse_prize_winners is 'Explicit record of cycle prize winners.';

alter table public.pulse_prize_winners enable row level security;

create table if not exists public.pulse_redemptions (
  id text primary key default gen_random_uuid()::text,
  prize_id text not null references public.pulse_prizes(id) on delete cascade,
  user_id text not null references public.pulse_profiles(id) on delete cascade,
  venue_id text null references public.pulse_venues(id) on delete set null,
  code text not null,
  status text not null default 'available' check (status in ('available','redeemed','expired')),
  redeemed_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.pulse_redemptions is 'User prize redemptions lifecycle.';

alter table public.pulse_redemptions enable row level security;

-- ============================================================
-- 4. ANALYTICS EVENTS
-- ============================================================

create table if not exists public.pulse_analytics_events (
  id bigserial primary key,
  user_id text null references public.pulse_profiles(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.pulse_analytics_events is 'Structured product analytics events.';

alter table public.pulse_analytics_events enable row level security;

create index if not exists idx_analytics_events_user_created on public.pulse_analytics_events(user_id, created_at desc);
create index if not exists idx_analytics_events_name_created on public.pulse_analytics_events(event_name, created_at desc);

-- ============================================================
-- 5. RPC FUNCTIONS
-- ============================================================

create or replace function public.pulse_user_id(p_token text)
returns text
language sql
security definer
set search_path = public
as $$
  select user_id from public.pulse_sessions where token = p_token and expires_at > now();
$$;

create or replace function public.pulse_require_admin(p_admin_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.pulse_admin_keys where admin_key = p_admin_key;
  return found;
end;
$$;

-- LEAGUES

create or replace function public.pulse_league_create(
  p_token text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_league_id text;
  v_code text;
  v_result jsonb;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sesion invalida.');
  end if;

  if coalesce(trim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'El nombre de la liga no puede estar vacio.');
  end if;

  v_league_id := gen_random_uuid()::text;
  v_code := upper(substring(md5(random()::text) for 6));

  insert into public.pulse_leagues (id, name, code, owner_user_id)
  values (v_league_id, trim(p_name), v_code, v_user_id);

  insert into public.pulse_league_members (league_id, user_id)
  values (v_league_id, v_user_id);

  insert into public.pulse_league_invites (code, league_id, max_uses, used_count)
  values (v_code, v_league_id, 100, 0);

  select jsonb_build_object(
    'ok', true,
    'league', jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'code', l.code,
      'ownerUserId', l.owner_user_id,
      'memberCount', 1,
      'isOwner', true
    )
  )
  into v_result
  from public.pulse_leagues l
  where l.id = v_league_id;

  return v_result;
end;
$$;

create or replace function public.pulse_league_join(
  p_token text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_league_id text;
  v_invite public.pulse_league_invites%rowtype;
  v_member_count bigint;
  v_result jsonb;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sesion invalida.');
  end if;

  select * into v_invite
  from public.pulse_league_invites
  where code = upper(trim(p_code));

  if v_invite is null then
    return jsonb_build_object('ok', false, 'error', 'Codigo de invitacion invalido.');
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'El codigo de invitacion vencio.');
  end if;

  if v_invite.used_count >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'error', 'El codigo de invitacion ya se uso el maximo de veces.');
  end if;

  v_league_id := v_invite.league_id;

  insert into public.pulse_league_members (league_id, user_id)
  values (v_league_id, v_user_id)
  on conflict (league_id, user_id) do nothing;

  if found then
    update public.pulse_league_invites
    set used_count = used_count + 1
    where code = v_invite.code;
  end if;

  select count(*) into v_member_count
  from public.pulse_league_members
  where league_id = v_league_id;

  select jsonb_build_object(
    'ok', true,
    'league', jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'code', l.code,
      'ownerUserId', l.owner_user_id,
      'memberCount', v_member_count,
      'isOwner', l.owner_user_id = v_user_id
    )
  )
  into v_result
  from public.pulse_league_invites i
  join public.pulse_leagues l on l.id = i.league_id
  where i.code = v_invite.code;

  return v_result;
end;
$$;

create or replace function public.pulse_league_list(
  p_token text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with member_leagues as (
    select lm.league_id
    from public.pulse_league_members lm
    where lm.user_id = public.pulse_user_id(p_token)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'code', l.code,
      'ownerUserId', l.owner_user_id,
      'memberCount', (select count(*) from public.pulse_league_members m where m.league_id = l.id),
      'isOwner', l.owner_user_id = public.pulse_user_id(p_token)
    )
    order by l.created_at desc
  ), '[]'::jsonb)
  from public.pulse_leagues l
  where l.id in (select league_id from member_leagues);
$$;

create or replace function public.pulse_league_ranking(
  p_token text,
  p_league_id text,
  p_cycle text default 'lifetime'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with members as (
    select user_id from public.pulse_league_members where league_id = p_league_id
  ),
  global_ranking as (
    select * from public.pulse_ranking(p_token, p_cycle)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'position', row_number() over (order by gr.points desc, gr.user->>'alias' asc),
      'points', gr.points,
      'lifetimePoints', gr."lifetimePoints",
      'user', gr.user,
      'isCurrentUser', gr."isCurrentUser"
    )
    order by gr.points desc, gr.user->>'alias' asc
  ), '[]'::jsonb)
  from global_ranking gr
  where (gr.user->>'id')::text in (select user_id from members);
$$;

create or replace function public.pulse_league_detail(
  p_token text,
  p_league_id text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'code', l.code,
    'ownerUserId', l.owner_user_id,
    'memberCount', (select count(*) from public.pulse_league_members m where m.league_id = l.id),
    'isOwner', l.owner_user_id = public.pulse_user_id(p_token)
  )
  from public.pulse_leagues l
  where l.id = p_league_id
  and exists (
    select 1 from public.pulse_league_members lm
    where lm.league_id = l.id and lm.user_id = public.pulse_user_id(p_token)
  );
$$;

-- TRIVIA

create or replace function public.pulse_trivia_today(
  p_token text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with today as (
    select q.*,
      exists (
        select 1 from public.pulse_trivia_answers a
        where a.question_id = q.id
          and a.user_id = public.pulse_user_id(p_token)
          and a.publish_date = q.publish_date
      ) as answered
    from public.pulse_trivia_questions q
    where q.status = 'active'
      and q.publish_date = current_date
    order by q.created_at
    limit 1
  )
  select case
    when not exists (select 1 from today) then
      jsonb_build_object('ok', true, 'question', null, 'message', 'Hoy no hay trivia disponible.')
    else (
      select jsonb_build_object(
        'ok', true,
        'question', jsonb_build_object(
          'id', t.id,
          'prompt', t.prompt,
          'options', t.options,
          'category', t.category,
          'difficulty', t.difficulty,
          'points', t.points,
          'publishDate', t.publish_date,
          'answered', t.answered
        )
      )
      from today t
    )
  end;
$$;

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
  v_question public.pulse_trivia_questions%rowtype;
  v_is_correct boolean;
  v_points integer;
  v_already boolean;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sesion invalida.');
  end if;

  select * into v_question
  from public.pulse_trivia_questions
  where id = p_question_id
    and status = 'active'
    and publish_date = current_date;

  if v_question is null then
    return jsonb_build_object('ok', false, 'error', 'Trivia no disponible hoy.');
  end if;

  select exists (
    select 1 from public.pulse_trivia_answers
    where question_id = p_question_id and user_id = v_user_id and publish_date = current_date
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', false, 'error', 'Ya respondiste la trivia de hoy.');
  end if;

  v_is_correct := v_question.correct_option = p_option_id;
  v_points := case when v_is_correct then v_question.points else 0 end;

  insert into public.pulse_trivia_answers (question_id, user_id, option_id, is_correct, points, publish_date)
  values (p_question_id, v_user_id, p_option_id, v_is_correct, v_points, current_date);

  if v_points > 0 then
    perform public.pulse_credit(v_user_id, 'trivia', p_question_id, v_points, jsonb_build_object('questionId', p_question_id, 'publishDate', current_date));
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_is_correct,
    'points', v_points,
    'correctOption', v_question.correct_option,
    'explanation', v_question.explanation
  );
end;
$$;

create or replace function public.pulse_trivia_admin_list(
  p_admin_key text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when not public.pulse_require_admin(p_admin_key) then
    jsonb_build_object('ok', false, 'error', 'Clave de administrador invalida.')
  else (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prompt', q.prompt,
        'options', q.options,
        'correctOption', q.correct_option,
        'explanation', q.explanation,
        'category', q.category,
        'difficulty', q.difficulty,
        'status', q.status,
        'publishDate', q.publish_date,
        'points', q.points
      ) order by q.created_at desc
    ), '[]'::jsonb)
    from public.pulse_trivia_questions q
  )
  end;
$$;

create or replace function public.pulse_trivia_admin_save(
  p_admin_key text,
  p_id text default null,
  p_prompt text default null,
  p_options jsonb default '[]'::jsonb,
  p_correct_option text default null,
  p_explanation text default null,
  p_category text default 'general',
  p_difficulty text default 'medium',
  p_status text default 'draft',
  p_publish_date date default null,
  p_points integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_admin_user text;
begin
  if not public.pulse_require_admin(p_admin_key) then
    return jsonb_build_object('ok', false, 'error', 'Clave de administrador invalida.');
  end if;

  if coalesce(trim(p_prompt), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'La pregunta no puede estar vacia.');
  end if;

  if jsonb_array_length(p_options) < 2 then
    return jsonb_build_object('ok', false, 'error', 'La trivia necesita al menos dos opciones.');
  end if;

  if coalesce(trim(p_correct_option), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Debes indicar la opcion correcta.');
  end if;

  select user_id into v_admin_user
  from public.pulse_admin_keys k
  limit 1;

  v_id := coalesce(nullif(trim(p_id), ''), gen_random_uuid()::text);

  insert into public.pulse_trivia_questions (
    id, prompt, options, correct_option, explanation, category, difficulty, status, publish_date, points, created_by
  )
  values (
    v_id, trim(p_prompt), p_options, p_correct_option, nullif(trim(p_explanation),''), p_category, p_difficulty, p_status, p_publish_date, p_points, v_admin_user
  )
  on conflict (id) do update set
    prompt = excluded.prompt,
    options = excluded.options,
    correct_option = excluded.correct_option,
    explanation = excluded.explanation,
    category = excluded.category,
    difficulty = excluded.difficulty,
    status = excluded.status,
    publish_date = excluded.publish_date,
    points = excluded.points;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.pulse_trivia_admin_set_status(
  p_admin_key text,
  p_question_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pulse_require_admin(p_admin_key) then
    return jsonb_build_object('ok', false, 'error', 'Clave de administrador invalida.');
  end if;

  update public.pulse_trivia_questions
  set status = p_status
  where id = p_question_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ANALYTICS

create or replace function public.pulse_analytics_track(
  p_token text,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
begin
  v_user_id := public.pulse_user_id(p_token);

  insert into public.pulse_analytics_events (user_id, event_name, properties)
  values (v_user_id, p_event_name, coalesce(p_properties, '{}'::jsonb));

  return jsonb_build_object('ok', true);
end;
$$;

-- MY STATS

create or replace function public.pulse_my_stats(
  p_token text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'predictionsMade', coalesce((
      select count(*) from public.pulse_match_predictions where user_id = public.pulse_user_id(p_token)
    ), 0),
    'triviaCorrect', coalesce((
      select count(*) from public.pulse_trivia_answers
      where user_id = public.pulse_user_id(p_token) and is_correct = true
    ), 0),
    'triviaAnswered', coalesce((
      select count(*) from public.pulse_trivia_answers
      where user_id = public.pulse_user_id(p_token)
    ), 0),
    'leaguesJoined', coalesce((
      select count(*) from public.pulse_league_members where user_id = public.pulse_user_id(p_token)
    ), 0),
    'prizesWon', coalesce((
      select count(*) from public.pulse_prizes where winner_user_id = public.pulse_user_id(p_token)
    ), 0)
  );
$$;

-- GRANTS

grant execute on function public.pulse_league_create(text, text) to anon, authenticated;
grant execute on function public.pulse_league_join(text, text) to anon, authenticated;
grant execute on function public.pulse_league_list(text) to anon, authenticated;
grant execute on function public.pulse_league_ranking(text, text, text) to anon, authenticated;
grant execute on function public.pulse_league_detail(text, text) to anon, authenticated;

grant execute on function public.pulse_trivia_today(text) to anon, authenticated;
grant execute on function public.pulse_trivia_answer(text, text, text) to anon, authenticated;

grant execute on function public.pulse_trivia_admin_list(text) to anon, authenticated;
grant execute on function public.pulse_trivia_admin_save(text, text, text, jsonb, text, text, text, text, text, date, integer) to anon, authenticated;
grant execute on function public.pulse_trivia_admin_set_status(text, text, text) to anon, authenticated;

grant execute on function public.pulse_analytics_track(text, text, jsonb) to anon, authenticated;
grant execute on function public.pulse_my_stats(text) to anon, authenticated;

-- ADMIN EXTRAS

create or replace function public.pulse_admin_create_cycle(
  p_admin_key text,
  p_id text,
  p_name text,
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pulse_require_admin(p_admin_key) then
    return jsonb_build_object('ok', false, 'error', 'Clave de administrador invalida.');
  end if;
  insert into public.pulse_cycles (id, name, starts_on, ends_on, status)
  values (p_id, p_name, p_starts_on, p_ends_on, 'open')
  on conflict (id) do update set
    name = excluded.name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_league_list(
  p_admin_key text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when not public.pulse_require_admin(p_admin_key) then
    jsonb_build_object('ok', false, 'error', 'Clave de administrador invalida.')
  else
    jsonb_build_object(
      'ok', true,
      'leagues', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'code', l.code,
          'ownerUserId', l.owner_user_id,
          'memberCount', (select count(*) from public.pulse_league_members m where m.league_id = l.id)
        ) order by l.created_at desc)
        from public.pulse_leagues l
      ), '[]'::jsonb)
    )
  end;
$$;

grant execute on function public.pulse_admin_create_cycle(text, text, text, date, date) to anon, authenticated;
grant execute on function public.pulse_admin_league_list(text) to anon, authenticated;
