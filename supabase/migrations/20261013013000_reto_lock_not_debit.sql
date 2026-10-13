-- Los retos ya no descuentan puntos al enviarse.
-- El bloqueo vive en el reto pendiente o en juego, no en el total ni en el ranking.

alter table public.pulse_retos drop constraint if exists pulse_retos_status_check;
alter table public.pulse_retos add constraint pulse_retos_status_check
  check (status = any (array['pending','live','rejected','expired','settled','void','cancelled']));

create or replace function public.pulse_reto_post(
  p_reto text,
  p_user text,
  p_action text,
  p_points integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := 'reto_' || p_action;
  v_source_id text := p_reto || ':' || p_user || ':' || p_action;
begin
  if p_action in ('hold', 'release') then
    insert into public.pulse_reto_audit (reto_id, user_id, action, points)
    values (p_reto, p_user, p_action, p_points);
    return;
  end if;

  insert into public.pulse_transactions as tx (id, user_id, experience_id, source_type, source_id, points, metadata)
  values (
    'tx_' || substr(md5(v_source_type || ':' || v_source_id), 1, 24),
    p_user,
    'exp_tobo',
    v_source_type,
    v_source_id,
    p_points,
    jsonb_build_object(
      'retoId', p_reto,
      'earnedOn', (now() at time zone 'America/Caracas')::date,
      'countsForRoundPrize', false
    )
  )
  on conflict (source_type, source_id) do nothing;

  insert into public.pulse_reto_audit (reto_id, user_id, action, points)
  values (p_reto, p_user, p_action, p_points);
exception
  when others then
    raise log 'reto_post % %', sqlstate, sqlerrm;
    raise;
end;
$$;

revoke all on function public.pulse_reto_post(text, text, text, integer) from public, anon, authenticated;

create or replace function public.pulse_reto_locked(p_user text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(reto.stake), 0)::int
  from public.pulse_retos reto
  where (reto.status = 'pending' and reto.challenger_id = p_user)
     or (reto.status = 'live' and (reto.challenger_id = p_user or reto.opponent_id = p_user));
$$;

create or replace function public.pulse_reto_spendable(p_user text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(public.pulse_cycle_points(p_user, 'lifetime') - public.pulse_reto_locked(p_user), 0);
$$;

revoke all on function public.pulse_reto_locked(text) from public, anon, authenticated;
revoke all on function public.pulse_reto_spendable(text) from public, anon, authenticated;

create or replace function public.pulse_reto_create(
  p_token text,
  p_kind text,
  p_alias text,
  p_stake integer,
  p_message text,
  p_match_id text,
  p_trivia_level text,
  p_device text,
  p_adult boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  opp text;
  opp_alias text;
  available integer;
  cap integer;
  active_count integer;
  pair_count integer;
  day_stake integer;
  today date := (now() at time zone 'America/Caracas')::date;
  reto_id text;
  note text;
  diff text;
  picked jsonb;
  deadline timestamptz;
  game public.pulse_matches%rowtype;
begin
  perform public.pulse_reto_settle();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  if coalesce(p_adult, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'Los retos son solo para mayores de 18.');
  end if;
  if coalesce(trim(p_device), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'No se pudo identificar el dispositivo.');
  end if;

  select id, alias into opp, opp_alias
  from public.pulse_profiles
  where lower(alias) = lower(trim(coalesce(p_alias, '')))
  limit 1;
  if opp is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos ese alias.');
  end if;
  if opp = uid then
    return jsonb_build_object('ok', false, 'error', 'No puedes retarte a ti mismo.');
  end if;
  if exists (
    select 1 from public.pulse_reto_blocks block
    where (block.blocker_id = opp and block.blocked_id = uid)
       or (block.blocker_id = uid and block.blocked_id = opp)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese rival no acepta retos.');
  end if;

  if uid < opp then
    perform pg_advisory_xact_lock(hashtext('reto-user:' || uid));
    perform pg_advisory_xact_lock(hashtext('reto-user:' || opp));
  else
    perform pg_advisory_xact_lock(hashtext('reto-user:' || opp));
    perform pg_advisory_xact_lock(hashtext('reto-user:' || uid));
  end if;

  insert into public.pulse_user_devices (user_id, device_id)
  values (uid, trim(p_device))
  on conflict (user_id, device_id) do update set seen_at = now();
  if exists (
    select 1 from public.pulse_user_devices device
    where device.device_id = trim(p_device) and device.user_id = opp
  ) then
    return jsonb_build_object('ok', false, 'error', 'No puedes retar una cuenta de este mismo dispositivo.');
  end if;

  update public.pulse_profiles set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = uid;

  available := public.pulse_reto_spendable(uid);
  cap := least(20, floor(available * 25 / 100.0)::int, available);
  if p_stake is null or p_stake < 2 or p_stake > 20 or p_stake > cap or p_stake > available then
    return jsonb_build_object('ok', false, 'error', 'No puedes apostar más puntos de los que tienes.');
  end if;

  select count(*) into active_count
  from public.pulse_retos reto
  where reto.status in ('pending', 'live')
    and (reto.challenger_id = uid or reto.opponent_id = uid);
  if active_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes 5 retos activos.');
  end if;
  select count(*) into active_count
  from public.pulse_retos reto
  where reto.status in ('pending', 'live')
    and (reto.challenger_id = opp or reto.opponent_id = opp);
  if active_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Ese rival ya tiene 5 retos activos.');
  end if;

  select count(*) into pair_count
  from public.pulse_retos reto
  where (reto.created_at at time zone 'America/Caracas')::date = today
    and reto.status in ('pending', 'live', 'settled')
    and (
      (reto.challenger_id = uid and reto.opponent_id = opp)
      or (reto.challenger_id = opp and reto.opponent_id = uid)
    );
  if pair_count >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Hoy ya se retaron 3 veces.');
  end if;

  select coalesce(sum(reto.stake), 0) into day_stake
  from public.pulse_retos reto
  where reto.challenger_id = uid
    and (reto.created_at at time zone 'America/Caracas')::date = today
    and reto.status in ('pending', 'live', 'settled');
  if day_stake + p_stake > 100 then
    return jsonb_build_object('ok', false, 'error', 'Llegaste al límite diario de puntos apostados.');
  end if;

  note := left(trim(coalesce(p_message, '')), 60);

  if p_kind = 'game' then
    select * into game from public.pulse_matches where id = p_match_id;
    if game.id is null or game.is_simulation or game.is_demo or game.status <> 'scheduled' or game.starts_at <= now() then
      return jsonb_build_object('ok', false, 'error', 'Ese juego ya no admite retos.');
    end if;
    if not exists (
      select 1 from public.pulse_match_predictions pred
      where pred.user_id = uid and pred.match_id = game.id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Primero guarda tu pronóstico.');
    end if;
    deadline := game.starts_at;
  elsif p_kind = 'trivia' then
    diff := public.pulse_trivia_difficulty(p_trivia_level);
    if diff is null then
      return jsonb_build_object('ok', false, 'error', 'Esa trivia no existe.');
    end if;
    select session.question_ids into picked
    from public.pulse_trivia_sessions session
    where session.user_id = uid and session.difficulty = diff and session.completed_at is null
    order by session.started_at desc
    limit 1;
    if picked is null or jsonb_array_length(picked) = 0 then
      select coalesce(jsonb_agg(chosen.id), '[]'::jsonb) into picked
      from (
        select question.id
        from public.pulse_trivia_questions question
        where question.status = 'active' and question.difficulty = diff
        order by md5(question.id || ':' || uid || ':' || today::text)
        limit 4
      ) chosen;
    end if;
    if jsonb_array_length(picked) = 0 then
      return jsonb_build_object('ok', false, 'error', 'Hoy no hay trivia para ese nivel.');
    end if;
    deadline := ((today + 1)::timestamp at time zone 'America/Caracas');
  else
    return jsonb_build_object('ok', false, 'error', 'Ese tipo de reto no existe.');
  end if;

  reto_id := 'reto_' || substr(md5(uid || ':' || opp || ':' || clock_timestamp()::text || ':' || gen_random_uuid()::text), 1, 20);
  insert into public.pulse_retos (
    id, kind, challenger_id, opponent_id, match_id, trivia_level, question_ids,
    stake, message, status, accept_until
  ) values (
    reto_id, p_kind, uid, opp,
    case when p_kind = 'game' then game.id else null end,
    case when p_kind = 'trivia' then p_trivia_level else null end,
    case when p_kind = 'trivia' then picked else null end,
    p_stake, note, 'pending', deadline
  );
  perform public.pulse_reto_post(reto_id, uid, 'hold', -p_stake);
  return jsonb_build_object('ok', true, 'id', reto_id, 'alias', opp_alias, 'stake', p_stake);
end;
$$;

create or replace function public.pulse_reto_respond(
  p_token text,
  p_reto_id text,
  p_accept boolean,
  p_device text,
  p_adult boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  reto public.pulse_retos%rowtype;
  available integer;
  cap integer;
begin
  perform public.pulse_reto_settle();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  select * into reto from public.pulse_retos where id = p_reto_id for update;
  if reto.id is null or reto.opponent_id <> uid or reto.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Ese reto ya no está pendiente.');
  end if;
  if now() >= reto.accept_until then
    perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
    update public.pulse_retos set status = 'expired', result = 'void', resolved_at = now() where id = reto.id;
    return jsonb_build_object('ok', false, 'error', 'El reto venció.');
  end if;

  if coalesce(p_accept, false) is not true then
    perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
    update public.pulse_retos set status = 'rejected', result = 'void', resolved_at = now() where id = reto.id;
    return jsonb_build_object('ok', true);
  end if;

  if coalesce(p_adult, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'Los retos son solo para mayores de 18.');
  end if;
  if coalesce(trim(p_device), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'No se pudo identificar el dispositivo.');
  end if;
  insert into public.pulse_user_devices (user_id, device_id)
  values (uid, trim(p_device))
  on conflict (user_id, device_id) do update set seen_at = now();
  if exists (
    select 1 from public.pulse_user_devices device
    where device.device_id = trim(p_device) and device.user_id = reto.challenger_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'No puedes aceptar un reto de una cuenta de este mismo dispositivo.');
  end if;

  perform pg_advisory_xact_lock(hashtext('reto-user:' || uid));
  available := public.pulse_reto_spendable(uid);
  cap := least(20, floor(available * 25 / 100.0)::int, available);
  if reto.stake > available or reto.stake > cap then
    return jsonb_build_object('ok', false, 'error', 'No tienes puntos suficientes para aceptar.');
  end if;

  perform public.pulse_reto_post(reto.id, uid, 'hold', -reto.stake);
  update public.pulse_profiles set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = uid;
  update public.pulse_retos set status = 'live' where id = reto.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_reto_settle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reto public.pulse_retos%rowtype;
  match public.pulse_matches%rowtype;
  played_a boolean;
  played_b boolean;
  points_a integer;
  points_b integer;
  error_a integer;
  error_b integer;
  time_a numeric;
  time_b numeric;
  needed integer;
  answers_a integer;
  answers_b integer;
  winner text;
  outcome text;
begin
  for reto in
    select * from public.pulse_retos
    where status in ('pending', 'live')
    order by created_at
    for update
  loop
    if reto.status = 'pending' and now() >= reto.accept_until then
      perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
      update public.pulse_retos
      set status = 'expired', result = 'void', resolved_at = now()
      where id = reto.id;
      continue;
    end if;

    if reto.status <> 'live' then
      continue;
    end if;

    if reto.kind = 'game' then
      select * into match from public.pulse_matches where id = reto.match_id;
      if match.id is null or match.status in ('cancelled', 'postponed') then
        perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
        perform public.pulse_reto_post(reto.id, reto.opponent_id, 'release', reto.stake);
        update public.pulse_retos set status = 'void', result = 'void', resolved_at = now() where id = reto.id;
        continue;
      end if;
      if match.status <> 'finished' then
        continue;
      end if;

      played_a := exists (
        select 1 from public.pulse_match_predictions pred
        where pred.user_id = reto.challenger_id and pred.match_id = reto.match_id
      );
      played_b := exists (
        select 1 from public.pulse_match_predictions pred
        where pred.user_id = reto.opponent_id and pred.match_id = reto.match_id
      );
      select coalesce(sum(tx.points), 0)::int into points_a
      from public.pulse_transactions tx
      where tx.user_id = reto.challenger_id
        and tx.source_type = 'prediction'
        and tx.metadata->>'matchId' = reto.match_id;
      select coalesce(sum(tx.points), 0)::int into points_b
      from public.pulse_transactions tx
      where tx.user_id = reto.opponent_id
        and tx.source_type = 'prediction'
        and tx.metadata->>'matchId' = reto.match_id;
      select abs(pred.predicted_home_score - match.home_score) + abs(pred.predicted_away_score - match.away_score)
      into error_a
      from public.pulse_match_predictions pred
      where pred.user_id = reto.challenger_id and pred.match_id = reto.match_id;
      select abs(pred.predicted_home_score - match.home_score) + abs(pred.predicted_away_score - match.away_score)
      into error_b
      from public.pulse_match_predictions pred
      where pred.user_id = reto.opponent_id and pred.match_id = reto.match_id;

      if not played_a and not played_b then
        outcome := 'tie';
        winner := null;
      elsif played_a and not played_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif played_b and not played_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif points_a > points_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif points_b > points_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif coalesce(error_a, 999) < coalesce(error_b, 999) then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif coalesce(error_b, 999) < coalesce(error_a, 999) then
        outcome := 'opponent';
        winner := reto.opponent_id;
      else
        outcome := 'tie';
        winner := null;
      end if;
    else
      needed := coalesce(jsonb_array_length(reto.question_ids), 0);
      select count(*)::int, coalesce(sum(answer.points), 0)::int,
        coalesce(extract(epoch from max(answer.answered_at) - min(answer.answered_at)), 0)
      into answers_a, points_a, time_a
      from public.pulse_trivia_answers answer
      where answer.user_id = reto.challenger_id
        and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)));
      select count(*)::int, coalesce(sum(answer.points), 0)::int,
        coalesce(extract(epoch from max(answer.answered_at) - min(answer.answered_at)), 0)
      into answers_b, points_b, time_b
      from public.pulse_trivia_answers answer
      where answer.user_id = reto.opponent_id
        and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)));
      played_a := needed > 0 and answers_a >= needed;
      played_b := needed > 0 and answers_b >= needed;
      if now() < reto.accept_until and not (played_a and played_b) then
        continue;
      end if;

      if not played_a and not played_b then
        outcome := 'tie';
        winner := null;
      elsif played_a and not played_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif played_b and not played_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif points_a > points_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif points_b > points_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      elsif time_a < time_b then
        outcome := 'challenger';
        winner := reto.challenger_id;
      elsif time_b < time_a then
        outcome := 'opponent';
        winner := reto.opponent_id;
      else
        outcome := 'tie';
        winner := null;
      end if;
    end if;

    if outcome = 'tie' then
      perform public.pulse_reto_post(reto.id, reto.challenger_id, 'release', reto.stake);
      perform public.pulse_reto_post(reto.id, reto.opponent_id, 'release', reto.stake);
      update public.pulse_retos
      set status = 'settled', result = 'tie', winner_id = null, resolved_at = now()
      where id = reto.id;
    else
      perform public.pulse_reto_post(reto.id, winner, 'win', reto.stake);
      perform public.pulse_reto_post(
        reto.id,
        case when winner = reto.challenger_id then reto.opponent_id else reto.challenger_id end,
        'loss',
        -reto.stake
      );
      update public.pulse_retos
      set status = 'settled', result = outcome, winner_id = winner, resolved_at = now()
      where id = reto.id;
    end if;
  end loop;
end;
$$;

create or replace function public.pulse_reto_board(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  total_points integer;
  locked_points integer;
  available integer;
  cap integer;
begin
  perform public.pulse_reto_settle();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.', 'items', '[]'::jsonb, 'won', 0, 'lost', 0, 'pending', 0, 'points', 0, 'locked', 0, 'available', 0, 'maxStake', 0);
  end if;
  total_points := public.pulse_cycle_points(uid, 'lifetime');
  locked_points := public.pulse_reto_locked(uid);
  available := greatest(total_points - locked_points, 0);
  cap := least(20, greatest(floor(available * 25 / 100.0)::int, 0), greatest(available, 0));

  return jsonb_build_object(
    'ok', true,
    'points', total_points,
    'locked', locked_points,
    'available', available,
    'maxStake', cap,
    'won', (
      select count(*) from public.pulse_retos reto
      where reto.status = 'settled' and reto.winner_id = uid
    ),
    'lost', (
      select count(*) from public.pulse_retos reto
      where reto.status = 'settled' and reto.winner_id is not null and reto.winner_id <> uid
        and (reto.challenger_id = uid or reto.opponent_id = uid)
    ),
    'pending', (
      select count(*) from public.pulse_retos reto
      where reto.status = 'pending' and reto.opponent_id = uid
    ),
    'items', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select
          reto.id,
          reto.kind,
          coalesce(reto.match_id, '') as "matchId",
          coalesce(reto.trivia_level, '') as "triviaLevel",
          reto.status,
          reto.stake,
          reto.message,
          rival.alias as rival,
          (reto.opponent_id = uid) as incoming,
          case
            when reto.kind = 'game' then coalesce(game.away_team, 'Juego') || ' vs ' || coalesce(game.home_team, '')
            else 'Trivia ' || coalesce(reto.trivia_level, '')
          end as label,
          reto.accept_until as "acceptUntil",
          (
            select count(*) from public.pulse_retos past
            where past.status = 'settled' and past.winner_id = uid
              and ((past.challenger_id = uid and past.opponent_id = rival.id) or (past.opponent_id = uid and past.challenger_id = rival.id))
          ) as "h2hMine",
          (
            select count(*) from public.pulse_retos past
            where past.status = 'settled' and past.winner_id = rival.id
              and ((past.challenger_id = uid and past.opponent_id = rival.id) or (past.opponent_id = uid and past.challenger_id = rival.id))
          ) as "h2hTheirs",
          case when reto.kind = 'game' then (
            select coalesce(sum(tx.points), 0)::int from public.pulse_transactions tx
            where tx.user_id = uid and tx.source_type = 'prediction' and tx.metadata->>'matchId' = reto.match_id
          ) else (
            select coalesce(sum(answer.points), 0)::int from public.pulse_trivia_answers answer
            where answer.user_id = uid and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)))
          ) end as "mineScore",
          case when reto.status = 'settled' and reto.kind = 'game' then (
            select coalesce(sum(tx.points), 0)::int from public.pulse_transactions tx
            where tx.user_id = rival.id and tx.source_type = 'prediction' and tx.metadata->>'matchId' = reto.match_id
          ) when reto.status = 'settled' then (
            select coalesce(sum(answer.points), 0)::int from public.pulse_trivia_answers answer
            where answer.user_id = rival.id and answer.question_id in (select jsonb_array_elements_text(coalesce(reto.question_ids, '[]'::jsonb)))
          ) else null end as "rivalScore",
          case
            when reto.status = 'settled' and reto.result = 'tie' then 'tie'
            when reto.status = 'void' then 'void'
            when reto.status = 'expired' then 'expired'
            when reto.status = 'rejected' then 'rejected'
            when reto.status = 'cancelled' then 'cancelled'
            when reto.status = 'settled' and reto.winner_id = uid then 'won'
            when reto.status = 'settled' then 'lost'
            when reto.status = 'live' then 'live'
            else 'pending'
          end as outcome
        from public.pulse_retos reto
        join public.pulse_profiles rival
          on rival.id = case when reto.challenger_id = uid then reto.opponent_id else reto.challenger_id end
        left join public.pulse_matches game on game.id = reto.match_id
        where reto.challenger_id = uid or reto.opponent_id = uid
        order by reto.created_at desc
        limit 12
      ) item
    ), '[]'::jsonb)
  );
end;
$$;


create or replace function public.pulse_reto_cancel(p_token text, p_reto_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  reto public.pulse_retos%rowtype;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para cancelar el reto.');
  end if;
  select * into reto from public.pulse_retos where id = p_reto_id for update;
  if reto.id is null or reto.challenger_id <> uid or reto.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Ese reto ya no se puede cancelar.');
  end if;
  update public.pulse_retos
  set status = 'cancelled', result = 'void', resolved_at = now()
  where id = reto.id;
  insert into public.pulse_reto_audit (reto_id, user_id, action, points)
  values (reto.id, uid, 'cancel', 0);
  return jsonb_build_object('ok', true);
exception
  when others then
    raise log 'reto_cancel % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error', 'No pudimos cancelar el reto. Inténtalo de nuevo.');
end;
$$;

grant execute on function public.pulse_reto_cancel(text, text) to anon, authenticated;

delete from public.pulse_transactions tx
where tx.source_type in ('reto_hold', 'reto_release')
  and exists (
    select 1 from public.pulse_retos reto
    where reto.id = tx.metadata->>'retoId'
      and reto.status in ('pending', 'rejected', 'expired', 'cancelled', 'void', 'live')
  );

alter table public.pulse_trivia_questions add column if not exists code text;
create unique index if not exists pulse_trivia_questions_code_unique
  on public.pulse_trivia_questions (code) where code is not null;

update public.pulse_trivia_questions
set review_note = 'pendiente de verificación'
where difficulty in ('medium', 'hard');

update public.pulse_trivia_questions set code = 'P001' where id = 'trv_ini_p001';
update public.pulse_trivia_questions set code = 'P002' where id = 'trv_ini_p002';
update public.pulse_trivia_questions set code = 'P003' where id = 'trv_ini_p003';
update public.pulse_trivia_questions set code = 'P004' where id = 'trv_ini_p004';
update public.pulse_trivia_questions set code = 'P005' where id = 'trv_ini_p005';
update public.pulse_trivia_questions set code = 'P006' where id = 'trv_ini_p006';
update public.pulse_trivia_questions set code = 'P007' where id = 'trv_ini_p007';
update public.pulse_trivia_questions set code = 'P008' where id = 'trv_ini_p008';
update public.pulse_trivia_questions set code = 'P009' where id = 'trv_ini_p009';
update public.pulse_trivia_questions set code = 'P010' where id = 'trv_ini_p010';
update public.pulse_trivia_questions set code = 'P011' where id = 'trv_ini_p011';
update public.pulse_trivia_questions set code = 'P012' where id = 'trv_ini_p012';
update public.pulse_trivia_questions set code = 'P013' where id = 'trv_ini_p013';
update public.pulse_trivia_questions set code = 'P014' where id = 'trv_ini_p014';
update public.pulse_trivia_questions set code = 'P015' where id = 'trv_ini_p015';
update public.pulse_trivia_questions set code = 'P016' where id = 'trv_ini_p016';
update public.pulse_trivia_questions set code = 'P017' where id = 'trv_ini_p017';
update public.pulse_trivia_questions set code = 'P018' where id = 'trv_ini_p018';
update public.pulse_trivia_questions set code = 'P019' where id = 'trv_ini_p019';
update public.pulse_trivia_questions set code = 'P020' where id = 'trv_ini_p020';
update public.pulse_trivia_questions set code = 'P021' where id = 'trv_ini_p021';
update public.pulse_trivia_questions set code = 'P022' where id = 'trv_ini_p022';
update public.pulse_trivia_questions set code = 'P023' where id = 'trv_ini_p023';
update public.pulse_trivia_questions set code = 'P024' where id = 'trv_ini_p024';
update public.pulse_trivia_questions set code = 'P025' where id = 'trv_ini_p025';
update public.pulse_trivia_questions set code = 'P026' where id = 'trv_ini_p026';
update public.pulse_trivia_questions set code = 'P027' where id = 'trv_ini_p027';
update public.pulse_trivia_questions set code = 'P028' where id = 'trv_ini_p028';
update public.pulse_trivia_questions set code = 'P029' where id = 'trv_ini_p029';
update public.pulse_trivia_questions set code = 'P030' where id = 'trv_ini_p030';
update public.pulse_trivia_questions set code = 'P061' where id = 'trv_ini_p061';
update public.pulse_trivia_questions set code = 'P062' where id = 'trv_ini_p062';
update public.pulse_trivia_questions set code = 'P063' where id = 'trv_ini_p063';
update public.pulse_trivia_questions set code = 'P064' where id = 'trv_ini_p064';
update public.pulse_trivia_questions set code = 'P065' where id = 'trv_ini_p065';
update public.pulse_trivia_questions set code = 'P066' where id = 'trv_ini_p066';
update public.pulse_trivia_questions set code = 'P067' where id = 'trv_ini_p067';
update public.pulse_trivia_questions set code = 'P068' where id = 'trv_ini_p068';
update public.pulse_trivia_questions set code = 'P069' where id = 'trv_ini_p069';
update public.pulse_trivia_questions set code = 'P070' where id = 'trv_ini_p070';
update public.pulse_trivia_questions set code = 'P071' where id = 'trv_ini_p071';
update public.pulse_trivia_questions set code = 'P072' where id = 'trv_ini_p072';
update public.pulse_trivia_questions set code = 'P073' where id = 'trv_ini_p073';
update public.pulse_trivia_questions set code = 'P074' where id = 'trv_ini_p074';
update public.pulse_trivia_questions set code = 'P075' where id = 'trv_ini_p075';
update public.pulse_trivia_questions set code = 'P076' where id = 'trv_ini_p076';
update public.pulse_trivia_questions set code = 'P077' where id = 'trv_ini_p077';
update public.pulse_trivia_questions set code = 'P078' where id = 'trv_ini_p078';
update public.pulse_trivia_questions set code = 'P079' where id = 'trv_ini_p079';
update public.pulse_trivia_questions set code = 'P080' where id = 'trv_ini_p080';
update public.pulse_trivia_questions set code = 'P081' where id = 'trv_ini_p081';
update public.pulse_trivia_questions set code = 'P082' where id = 'trv_ini_p082';
update public.pulse_trivia_questions set code = 'P083' where id = 'trv_ini_p083';
update public.pulse_trivia_questions set code = 'P084' where id = 'trv_ini_p084';
update public.pulse_trivia_questions set code = 'P085' where id = 'trv_ini_p085';
update public.pulse_trivia_questions set code = 'P086' where id = 'trv_ini_p086';
update public.pulse_trivia_questions set code = 'P087' where id = 'trv_ini_p087';
update public.pulse_trivia_questions set code = 'P088' where id = 'trv_ini_p088';
update public.pulse_trivia_questions set code = 'P089' where id = 'trv_ini_p089';
update public.pulse_trivia_questions set code = 'P090' where id = 'trv_ini_p090';
