-- Final MVP rules: October cycles, schedule-based round attribution,
-- idempotent trivia, server-authoritative QR/challenge bonuses, safe round close.

-- Rounds are date ranges in America/Caracas; the end date includes its full day.
insert into public.pulse_cycles (id, name, starts_on, ends_on, status)
values
  ('ronda_1', 'Ronda 1', date '2026-10-12', date '2026-10-22', 'open'),
  ('ronda_2', 'Ronda 2', date '2026-10-23', date '2026-10-29', 'open'),
  ('ronda_3', 'Ronda 3', date '2026-10-30', date '2026-11-05', 'open')
on conflict (id) do update
set name = excluded.name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on;

-- Challenge selection is capped at 3 by pulse_save_challenge_answers;
-- constrain each correct answer to exactly +1, making the per-match maximum +3.
alter table public.pulse_challenge_templates drop constraint if exists pulse_challenge_templates_points_check;
alter table public.pulse_game_challenges drop constraint if exists pulse_game_challenges_points_check;
update public.pulse_challenge_templates set points = 1 where points <> 1;
update public.pulse_game_challenges set points = 1 where points <> 1;
alter table public.pulse_challenge_templates add constraint pulse_challenge_templates_points_check check (points = 1);
alter table public.pulse_game_challenges add constraint pulse_game_challenges_points_check check (points = 1);

update public.pulse_challenge_answers answer
set points_awarded = case when answer.correct then 1 else 0 end
where answer.evaluated_at is not null
  and answer.points_awarded is distinct from case when answer.correct then 1 else 0 end;
update public.pulse_transactions tx
set points = 1,
    metadata = tx.metadata || jsonb_build_object('pointsAwarded', 1)
from public.pulse_challenge_answers answer
join public.pulse_game_challenges challenge on challenge.id = answer.game_challenge_id
where tx.source_type = 'game_challenge'
  and tx.source_id = answer.user_id || ':' || challenge.id
  and answer.correct is true
  and tx.points is distinct from 1;
delete from public.pulse_transactions tx
where tx.source_type = 'game_challenge'
  and not exists (
    select 1 from public.pulse_challenge_answers answer
    join public.pulse_game_challenges challenge on challenge.id = answer.game_challenge_id
    where tx.source_id = answer.user_id || ':' || challenge.id and answer.correct is true
  );

update public.pulse_transactions
set points = 3
where source_type = 'qr_scan' and points is distinct from 3;

-- Historical repeated answers to the same trivia are consolidated to the earliest attempt.
with ranked as (
  select user_id, question_id, publish_date,
         row_number() over (partition by user_id, question_id order by answered_at, publish_date) as attempt_no
  from public.pulse_trivia_answers
), removed as (
  delete from public.pulse_trivia_answers answer
  using ranked
  where answer.user_id = ranked.user_id
    and answer.question_id = ranked.question_id
    and answer.publish_date = ranked.publish_date
    and ranked.attempt_no > 1
  returning answer.user_id, answer.question_id, answer.publish_date
)
delete from public.pulse_transactions tx
using removed
where tx.user_id = removed.user_id
  and tx.source_type = 'trivia'
  and tx.metadata->>'questionId' = removed.question_id
  and tx.metadata->>'publishDate' = removed.publish_date::text;

create unique index if not exists pulse_trivia_answers_one_attempt
  on public.pulse_trivia_answers (user_id, question_id);

update public.pulse_trivia_questions set points = 5 where points <> 5;
update public.pulse_trivia_answers answer
set points = case when answer.is_correct then 5 else 0 end;

-- Ensure only one historical trivia credit per user/question, with the prescribed +5 value.
delete from public.pulse_transactions tx
where tx.source_type = 'trivia'
  and tx.metadata ? 'questionId';

select public.pulse_credit(answer.user_id, 'trivia', answer.question_id, 5,
  jsonb_build_object('questionId', answer.question_id, 'publishDate', answer.publish_date::text, 'earnedOn', answer.publish_date::text))
from public.pulse_trivia_answers answer
where answer.is_correct;

create or replace function public.pulse_trivia_today(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  today date := (now() at time zone 'America/Caracas')::date;
  questions jsonb;
begin
  uid := public.pulse_user_id(p_token);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'prompt', q.prompt,
    'options', q.options,
    'category', q.category,
    'difficulty', q.difficulty,
    'points', 5,
    'publishDate', today::text,
    'answered', exists (
      select 1 from public.pulse_trivia_answers a
      where a.question_id = q.id and a.user_id = uid
    )
  ) order by md5(q.id || today::text)), '[]'::jsonb)
  into questions
  from (
    select question.*
    from public.pulse_trivia_questions question
    where question.status = 'active'
    order by md5(question.id || today::text)
    limit 2
  ) q;
  return jsonb_build_object('ok', true, 'questions', questions);
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
  uid text;
  today date := (now() at time zone 'America/Caracas')::date;
  question public.pulse_trivia_questions%rowtype;
  is_correct boolean;
  inserted_question text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  select * into question
  from public.pulse_trivia_questions
  where id = p_question_id and status = 'active'
  for share;
  if question.id is null then
    return jsonb_build_object('ok', false, 'error', 'Pregunta no disponible.');
  end if;
  if not exists (select 1 from jsonb_array_elements(question.options) option where option->>'id' = p_option_id) then
    return jsonb_build_object('ok', false, 'error', 'Esa respuesta no existe.');
  end if;

  is_correct := question.correct_option = p_option_id;
  insert into public.pulse_trivia_answers (question_id, user_id, option_id, is_correct, points, publish_date)
  values (question.id, uid, p_option_id, is_correct, case when is_correct then 5 else 0 end, today)
  on conflict (user_id, question_id) do nothing
  returning question_id into inserted_question;
  if inserted_question is null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ANSWERED', 'error', 'Ya respondiste esta trivia.');
  end if;
  if is_correct then
    perform public.pulse_credit(uid, 'trivia', question.id, 5,
      jsonb_build_object('questionId', question.id, 'publishDate', today::text, 'earnedOn', today::text));
  end if;
  return jsonb_build_object(
    'ok', true,
    'correct', is_correct,
    'points', case when is_correct then 5 else 0 end,
    'correctOption', question.correct_option,
    'explanation', coalesce(question.explanation, '')
  );
end;
$$;

grant execute on function public.pulse_trivia_today(text) to anon, authenticated;
grant execute on function public.pulse_trivia_answer(text, text, text) to anon, authenticated;

-- QR credit is fixed at +3 and protected by the existing (user, venue, Caracas date) unique key.
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
  points integer := 3;
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
    'id', q.id, 'prompt', q.prompt, 'options', q.options, 'closesAt', q.closes_at,
    'status', q.status,
    'myOption', a.option_id,
    'correctOption', case when q.status in ('resolved', 'void') then q.correct_option else null end,
    'points', public.pulse_cfg_int('FLASH_POINTS')
  ) into flash
  from public.pulse_flash_questions q
  left join public.pulse_flash_answers a on a.question_id = q.id and a.user_id = uid
  where q.status = 'open' and q.opens_at <= now() and q.closes_at > now()
    and (q.venue_id is null or q.venue_id = venue.id)
  order by q.closes_at limit 1;
  return jsonb_build_object(
    'ok', true, 'already', already, 'points', case when already then 0 else points end,
    'venue', jsonb_build_object(
      'id', venue.id, 'name', venue.name, 'zone', venue.zone, 'address', venue.address,
      'contact', venue.contact, 'broadcasts', venue.broadcasts, 'isFounder', venue.is_founder
    ),
    'flash', flash
  );
end;
$$;

grant execute on function public.pulse_qr_visit(text, text) to anon, authenticated;

-- Close only after 23:59 Caracas, and only after every match that started in the cycle
-- has an official final result or was cancelled. Schedule start, never finish/result time, assigns a cycle.
create or replace function public.pulse_admin_close_round(p_admin_key text, p_cycle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle public.pulse_cycles%rowtype;
  close_at timestamptz;
  ranked record;
  slot integer := 0;
  code text;
begin
  perform public.pulse_require_admin(p_admin_key);
  if p_cycle = 'demo_cierre' then
    return jsonb_build_object('ok', false, 'error', 'Ese cierre es solo de demostración. Usa el simulador.');
  end if;
  select * into cycle from public.pulse_cycles where id = p_cycle for update;
  if cycle.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa ronda no existe.');
  end if;
  close_at := ((cycle.ends_on + time '23:59:59') at time zone 'America/Caracas');
  if now() < close_at then
    return jsonb_build_object('ok', false, 'error', 'La ronda todavía no llegó a su hora de cierre.');
  end if;
  if exists (
    select 1 from public.pulse_matches match
    where (match.starts_at at time zone 'America/Caracas')::date between cycle.starts_on and cycle.ends_on
      and match.starts_at <= close_at
      and match.status not in ('finished', 'cancelled')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay partidos de esta ronda pendientes de resultado final.');
  end if;
  if exists (select 1 from public.pulse_prizes where cycle_id = p_cycle) then
    update public.pulse_cycles set status = 'closed' where id = p_cycle;
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  for ranked in
    select item->'user'->>'id' as user_id
    from jsonb_array_elements(public.pulse_ranking('', p_cycle)) item
    join public.pulse_profiles profile on profile.id = item->'user'->>'id'
    where profile.prize_eligible
      and (item->>'points')::int > 0
      and not exists (
        select 1 from public.pulse_league_members member where member.user_id = profile.id
      )
    order by (item->>'position')::int
    limit 3
  loop
    slot := slot + 1;
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.pulse_prizes (id, cycle_id, rank_slot, winner_user_id, redemption_code, expires_at)
    values ('prize_' || p_cycle || '_' || slot, p_cycle, slot, ranked.user_id, code, now() + interval '14 days');
    update public.pulse_profiles set prize_eligible = false where id = ranked.user_id;
  end loop;
  update public.pulse_cycles set status = 'closed' where id = p_cycle;
  return jsonb_build_object('ok', true, 'awarded', slot);
end;
$$;

grant execute on function public.pulse_admin_close_round(text, text) to anon, authenticated;

-- Public rankings exclude private-league participants; passing a league ID scopes
-- the exact same score calculation to that league's members.
drop function if exists public.pulse_league_ranking(text, text, text);
drop function if exists public.pulse_ranking(text, text);

create or replace function public.pulse_ranking(
  p_token text,
  p_cycle text default 'lifetime',
  p_league_id text default null
)
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
  if p_league_id is not null and (
    uid is null or not exists (
      select 1 from public.pulse_league_members member
      where member.league_id = p_league_id and member.user_id = uid
    )
  ) then
    return '[]'::jsonb;
  end if;
  if p_cycle is null or p_cycle = 'lifetime' then
    c_start := null;
    c_end := null;
  else
    select starts_on, ends_on into c_start, c_end
    from public.pulse_cycles where id = p_cycle;
    if c_start is null then return '[]'::jsonb; end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'position', ranked.position,
      'points', ranked.points,
      'lifetimePoints', ranked.lifetime_points,
      'isCurrentUser', ranked.id = uid,
      'user', jsonb_build_object(
        'id', ranked.id, 'alias', ranked.alias, 'handle', ranked.handle,
        'initials', ranked.initials, 'avatarColor', ranked.avatar_color
      )
    ) order by ranked.position)
    from (
      select profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color,
        coalesce(sum(tx.points) filter (
          where c_start is null or coalesce(
            (match.starts_at at time zone 'America/Caracas')::date,
            nullif(tx.metadata->>'earnedOn', '')::date
          ) between c_start and c_end
        ), 0)::int as points,
        coalesce(sum(tx.points), 0)::int as lifetime_points,
        coalesce(sum(tx.points) filter (
          where tx.source_type = 'prediction'
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        ), 0)::int as prediction_points,
        count(*) filter (
          where tx.source_type = 'prediction' and (tx.metadata->>'errorTotal')::int = 0
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        )::int as exacts,
        count(*) filter (
          where tx.source_type = 'prediction' and (tx.metadata->>'winnerPoints')::int = 40
            and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        )::int as winners,
        (
          select max(pred.updated_at)
          from public.pulse_match_predictions pred
          join public.pulse_matches pred_match on pred_match.id = pred.match_id
          where pred.user_id = profile.id
            and not pred_match.is_simulation
            and not pred_match.is_demo
            and (c_start is null or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        ) as last_prediction_at,
        row_number() over (order by
          coalesce(sum(tx.points) filter (
            where c_start is null or coalesce(
              (match.starts_at at time zone 'America/Caracas')::date,
              nullif(tx.metadata->>'earnedOn', '')::date
            ) between c_start and c_end
          ), 0) desc,
          coalesce(sum(tx.points) filter (
            where tx.source_type = 'prediction'
              and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ), 0) desc,
          count(*) filter (
            where tx.source_type = 'prediction' and (tx.metadata->>'errorTotal')::int = 0
              and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ) desc,
          count(*) filter (
            where tx.source_type = 'prediction' and (tx.metadata->>'winnerPoints')::int = 40
              and (c_start is null or (match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ) desc,
          (
            select max(pred.updated_at)
            from public.pulse_match_predictions pred
            join public.pulse_matches pred_match on pred_match.id = pred.match_id
            where pred.user_id = profile.id
              and not pred_match.is_simulation
              and not pred_match.is_demo
              and (c_start is null or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
          ) asc nulls last,
          profile.alias asc
        ) as position
      from public.pulse_profiles profile
      left join public.pulse_transactions tx on tx.user_id = profile.id
        and not coalesce((tx.metadata->>'simulation')::boolean, false)
        and (
          tx.metadata->>'matchId' is null
          or exists (
            select 1 from public.pulse_matches eligible_match
            where eligible_match.id = tx.metadata->>'matchId'
              and not eligible_match.is_simulation
              and not eligible_match.is_demo
          )
        )
      left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
      where case when p_league_id is null then
          not exists (select 1 from public.pulse_league_members member where member.user_id = profile.id)
        else exists (
          select 1 from public.pulse_league_members member
          where member.user_id = profile.id and member.league_id = p_league_id
        )
      end
      group by profile.id, profile.alias, profile.handle, profile.initials, profile.avatar_color
    ) ranked
  ), '[]'::jsonb);
end;
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
  select public.pulse_ranking(p_token, p_cycle, p_league_id);
$$;

grant execute on function public.pulse_ranking(text, text, text) to anon, authenticated;
grant execute on function public.pulse_league_ranking(text, text, text) to anon, authenticated;
