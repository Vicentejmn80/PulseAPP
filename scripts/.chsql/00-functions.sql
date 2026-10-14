-- Retos del partido: banco fijo, asignación automática y bonus separado del pronóstico.

create table if not exists public.pulse_challenge_templates (
  id text primary key,
  code text not null unique,
  title text not null,
  description text not null default '',
  category text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  points integer not null check (points in (2, 4, 6, 8, 10)),
  answer_type text not null check (answer_type in ('boolean', 'multiple')),
  options jsonb not null,
  scoring_rule jsonb not null,
  required_facts text[] not null default '{}',
  active boolean not null default true,
  priority integer not null default 0,
  cooldown_days integer not null default 2,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_game_challenges (
  id text primary key,
  game_id text not null references public.pulse_matches (id) on delete cascade,
  template_id text not null references public.pulse_challenge_templates (id),
  position integer not null check (position between 1 and 5),
  points integer not null,
  title text not null,
  description text not null default '',
  category text not null,
  difficulty text not null,
  answer_type text not null,
  options jsonb not null,
  scoring_rule jsonb not null,
  unique (game_id, template_id),
  unique (game_id, position)
);

create table if not exists public.pulse_challenge_answers (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  game_challenge_id text not null references public.pulse_game_challenges (id) on delete cascade,
  option_id text not null,
  correct boolean,
  points_awarded integer,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, game_challenge_id)
);

alter table public.pulse_challenge_templates enable row level security;
alter table public.pulse_game_challenges enable row level security;
alter table public.pulse_challenge_answers enable row level security;

create or replace function public.pulse_challenge_fact(p_fact text, p_home integer, p_away integer)
returns integer
language sql
immutable
as $$
  select case p_fact
    when 'margin' then abs(p_home - p_away)
    when 'winner_runs' then greatest(p_home, p_away)
    when 'loser_runs' then least(p_home, p_away)
    when 'home' then p_home
    when 'away' then p_away
    else p_home + p_away
  end;
$$;

create or replace function public.pulse_challenge_rule_holds(p_rule jsonb, p_home integer, p_away integer)
returns boolean
language plpgsql
immutable
as $$
declare
  op text := p_rule->>'op';
  n integer := nullif(p_rule->>'n', '')::integer;
  total integer := p_home + p_away;
  margin integer := abs(p_home - p_away);
  winner integer := greatest(p_home, p_away);
  loser integer := least(p_home, p_away);
  sub jsonb;
begin
  if op = 'total_gte' then return total >= n; end if;
  if op = 'total_lte' then return total <= n; end if;
  if op = 'total_eq' then return total = n; end if;
  if op = 'margin_eq' then return margin = n; end if;
  if op = 'margin_gte' then return margin >= n; end if;
  if op = 'margin_lte' then return margin <= n; end if;
  if op = 'both_gte' then return p_home >= n and p_away >= n; end if;
  if op = 'both_lte' then return p_home <= n and p_away <= n; end if;
  if op = 'either_gte' then return p_home >= n or p_away >= n; end if;
  if op = 'loser_lte' then return loser <= n; end if;
  if op = 'loser_gte' then return loser >= n; end if;
  if op = 'winner_gte' then return winner >= n; end if;
  if op = 'winner_lte' then return winner <= n; end if;
  if op = 'home_gte' then return p_home >= n; end if;
  if op = 'home_lte' then return p_home <= n; end if;
  if op = 'home_eq' then return p_home = n; end if;
  if op = 'away_gte' then return p_away >= n; end if;
  if op = 'away_lte' then return p_away <= n; end if;
  if op = 'away_eq' then return p_away = n; end if;
  if op = 'shutout' then return loser = 0; end if;
  if op = 'parity' then
    if coalesce((p_rule->>'even')::boolean, false) then return total % 2 = 0; end if;
    return total % 2 = 1;
  end if;
  if op = 'winner_doubles' then return loser >= 1 and winner >= loser * 2; end if;
  if op = 'and' then
    for sub in select value from jsonb_array_elements(coalesce(p_rule->'rules', '[]'::jsonb))
    loop
      if not public.pulse_challenge_rule_holds(sub, p_home, p_away) then
        return false;
      end if;
    end loop;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.pulse_challenge_correct_option(p_rule jsonb, p_home integer, p_away integer)
returns text
language plpgsql
immutable
as $$
declare
  bucket jsonb;
  value integer;
begin
  if p_rule->>'op' = 'buckets' then
    value := public.pulse_challenge_fact(p_rule->>'fact', p_home, p_away);
    for bucket in select item.value from jsonb_array_elements(coalesce(p_rule->'buckets', '[]'::jsonb)) item
    loop
      if value >= (bucket->>'min')::integer
         and (bucket->>'max' is null or bucket->>'max' = '' or value <= (bucket->>'max')::integer) then
        return bucket->>'id';
      end if;
    end loop;
    return '';
  end if;
  if public.pulse_challenge_rule_holds(p_rule, p_home, p_away) then
    return 'si';
  end if;
  return 'no';
end;
$$;

create or replace function public.pulse_assign_game_challenges(p_game text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.pulse_matches;
  blocked text[] := '{}';
  compatible_count integer := 0;
  fresh_count integer := 0;
  use_fresh boolean := false;
  plan integer[];
  slot integer;
  picked text[] := '{}';
  cats text[] := '{}';
  chosen text;
  chosen_cat text;
  filler record;
  ordered text[] := '{}';
  rotate integer;
  swap_at integer;
  tmp text;
  pos integer := 0;
  tpl public.pulse_challenge_templates;
begin
  if exists (select 1 from public.pulse_game_challenges where game_id = p_game) then
    return (select count(*)::integer from public.pulse_game_challenges where game_id = p_game);
  end if;

  select * into game from public.pulse_matches where id = p_game;
  if game.id is null then
    return 0;
  end if;

  select coalesce(array_agg(distinct t.code), '{}') into blocked
  from public.pulse_game_challenges gc
  join public.pulse_challenge_templates t on t.id = gc.template_id
  join public.pulse_matches prev on prev.id = gc.game_id
  where prev.id <> p_game
    and prev.starts_at < game.starts_at
    and prev.starts_at >= game.starts_at - make_interval(days => greatest(t.cooldown_days, 0));

  select count(*) into compatible_count
  from public.pulse_challenge_templates t
  where t.active
    and t.scoring_rule is not null
    and jsonb_typeof(t.options) = 'array'
    and jsonb_array_length(t.options) >= 2
    and t.required_facts <@ array['home_score', 'away_score', 'home_team', 'away_team']::text[];

  select count(*) into fresh_count
  from public.pulse_challenge_templates t
  where t.active
    and t.scoring_rule is not null
    and jsonb_typeof(t.options) = 'array'
    and jsonb_array_length(t.options) >= 2
    and t.required_facts <@ array['home_score', 'away_score', 'home_team', 'away_team']::text[]
    and not (t.code = any(blocked));

  use_fresh := fresh_count > 0 and fresh_count >= least(5, compatible_count);

  case abs(('x' || substr(md5(p_game || ':plan'), 1, 8))::bit(32)::int) % 4
    when 0 then plan := array[2, 4, 4, 6, 8];
    when 1 then plan := array[2, 4, 6, 8, 10];
    when 2 then plan := array[2, 4, 6, 6, 10];
    else plan := array[2, 4, 4, 8, 10];
  end case;

  foreach slot in array plan loop
    exit when cardinality(picked) >= 5;
    select t.code, t.category into chosen, chosen_cat
    from public.pulse_challenge_templates t
    where t.active
      and t.scoring_rule is not null
      and jsonb_typeof(t.options) = 'array'
      and jsonb_array_length(t.options) >= 2
      and t.required_facts <@ array['home_score', 'away_score', 'home_team', 'away_team']::text[]
      and (not use_fresh or not (t.code = any(blocked)))
      and t.points = slot
      and not (t.code = any(picked))
      and not (t.category = any(cats))
    order by ('x' || substr(md5(p_game || ':' || t.code), 1, 8))::bit(32)::int,
             t.priority desc,
             t.code
    limit 1;
    if chosen is not null then
      picked := picked || chosen;
      cats := cats || chosen_cat;
    end if;
    chosen := null;
    chosen_cat := null;
  end loop;

  for filler in
    select t.code, t.category
    from public.pulse_challenge_templates t
    where t.active
      and t.scoring_rule is not null
      and jsonb_typeof(t.options) = 'array'
      and jsonb_array_length(t.options) >= 2
      and t.required_facts <@ array['home_score', 'away_score', 'home_team', 'away_team']::text[]
      and (not use_fresh or not (t.code = any(blocked)))
      and not (t.code = any(picked))
      and not (t.category = any(cats))
    order by ('x' || substr(md5(p_game || ':' || t.code), 1, 8))::bit(32)::int,
             t.priority desc,
             t.code
  loop
    exit when cardinality(picked) >= 5;
    picked := picked || filler.code;
    cats := cats || filler.category;
  end loop;

  for filler in
    select t.code
    from public.pulse_challenge_templates t
    where t.active
      and t.scoring_rule is not null
      and jsonb_typeof(t.options) = 'array'
      and jsonb_array_length(t.options) >= 2
      and t.required_facts <@ array['home_score', 'away_score', 'home_team', 'away_team']::text[]
      and (not use_fresh or not (t.code = any(blocked)))
      and not (t.code = any(picked))
    order by ('x' || substr(md5(p_game || ':' || t.code), 1, 8))::bit(32)::int,
             t.priority desc,
             t.code
  loop
    exit when cardinality(picked) >= 5;
    picked := picked || filler.code;
  end loop;

  if cardinality(picked) = 0 then
    return 0;
  end if;

  select coalesce(array_agg(code order by points, code), '{}') into ordered
  from public.pulse_challenge_templates
  where code = any(picked);

  rotate := abs(('x' || substr(md5(p_game || ':order'), 1, 8))::bit(32)::int);
  if cardinality(ordered) >= 2 and rotate % 2 = 1 then
    swap_at := (rotate % (cardinality(ordered) - 1)) + 1;
    tmp := ordered[swap_at];
    ordered[swap_at] := ordered[swap_at + 1];
    ordered[swap_at + 1] := tmp;
  end if;

  foreach chosen in array ordered loop
    pos := pos + 1;
    select * into tpl from public.pulse_challenge_templates where code = chosen;
    insert into public.pulse_game_challenges (
      id, game_id, template_id, position, points, title, description, category, difficulty, answer_type, options, scoring_rule
    ) values (
      'gch_' || substr(md5(p_game || ':' || tpl.code), 1, 24),
      p_game,
      tpl.id,
      pos,
      tpl.points,
      tpl.title,
      tpl.description,
      tpl.category,
      tpl.difficulty,
      tpl.answer_type,
      tpl.options,
      tpl.scoring_rule
    )
    on conflict (game_id, template_id) do nothing;
  end loop;

  return pos;
end;
$$;

create or replace function public.pulse_match_challenges(p_token text, p_match text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
begin
  uid := public.pulse_user_id(p_token);
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if not exists (select 1 from public.pulse_game_challenges where game_id = match.id) then
    perform public.pulse_assign_game_challenges(match.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'max', 3,
    'finished', match.status = 'finished',
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gc.id,
        'position', gc.position,
        'points', gc.points,
        'title', gc.title,
        'description', gc.description,
        'category', gc.category,
        'difficulty', gc.difficulty,
        'answerType', gc.answer_type,
        'options', gc.options,
        'myOption', ans.option_id,
        'evaluated', ans.evaluated_at is not null,
        'correct', case when match.status = 'finished' then ans.correct else null end,
        'pointsAwarded', case when match.status = 'finished' then coalesce(ans.points_awarded, 0) else null end,
        'correctOption', case
          when match.status = 'finished' and match.home_score is not null and match.away_score is not null
            then public.pulse_challenge_correct_option(gc.scoring_rule, match.home_score, match.away_score)
          else null
        end
      ) order by gc.position)
      from public.pulse_game_challenges gc
      left join public.pulse_challenge_answers ans
        on ans.game_challenge_id = gc.id and ans.user_id = uid
      where gc.game_id = match.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_save_challenge_answers(p_token text, p_match text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  item jsonb;
  challenge public.pulse_game_challenges;
  option_id text;
  challenge_id text;
  seen text[] := '{}';
  saved integer := 0;
begin
  perform public.pulse_lock_due_matches();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para guardar el pronóstico.');
  end if;
  select * into match from public.pulse_matches where id = p_match for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.status in ('finished', 'cancelled', 'locked') or match.starts_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. Los retos están cerrados.');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Elige los retos de nuevo.');
  end if;
  if jsonb_array_length(p_answers) > 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya elegiste 3 retos. Cambia uno para seleccionar otro.');
  end if;

  for item in select value from jsonb_array_elements(p_answers)
  loop
    challenge_id := item->>'challengeId';
    option_id := item->>'optionId';
    if challenge_id is null or challenge_id = any(seen) then
      return jsonb_build_object('ok', false, 'error', 'Revisa los retos elegidos.');
    end if;
    seen := seen || challenge_id;
    select * into challenge from public.pulse_game_challenges where id = challenge_id and game_id = match.id;
    if challenge.id is null then
      return jsonb_build_object('ok', false, 'error', 'Ese reto no pertenece a este partido.');
    end if;
    if not exists (
      select 1 from jsonb_array_elements(challenge.options) opt
      where opt->>'id' = option_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Esa opción no existe.');
    end if;
  end loop;

  delete from public.pulse_challenge_answers ans
  using public.pulse_game_challenges gc
  where ans.game_challenge_id = gc.id
    and ans.user_id = uid
    and gc.game_id = match.id
    and ans.evaluated_at is null
    and not (ans.game_challenge_id = any(seen));

  for item in select value from jsonb_array_elements(p_answers)
  loop
    challenge_id := item->>'challengeId';
    option_id := item->>'optionId';
    insert into public.pulse_challenge_answers (id, user_id, game_challenge_id, option_id)
    values (
      'cha_' || substr(md5(uid || ':' || challenge_id), 1, 24),
      uid,
      challenge_id,
      option_id
    )
    on conflict (user_id, game_challenge_id) do update
    set option_id = excluded.option_id
    where public.pulse_challenge_answers.evaluated_at is null
      and public.pulse_challenge_answers.option_id is distinct from excluded.option_id;
    saved := saved + 1;
  end loop;

  return jsonb_build_object('ok', true, 'saved', saved);
end;
$$;

create or replace function public.pulse_evaluate_match_challenges(p_match text, p_home integer, p_away integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  match public.pulse_matches;
  row record;
  right_option text;
  hit boolean;
  bonus integer;
  awarded integer := 0;
begin
  select * into match from public.pulse_matches where id = p_match;
  if match.id is null or p_home is null or p_away is null then
    return 0;
  end if;

  for row in
    select ans.id, ans.user_id, ans.option_id, ans.evaluated_at, gc.id as challenge_id, gc.points, gc.scoring_rule
    from public.pulse_challenge_answers ans
    join public.pulse_game_challenges gc on gc.id = ans.game_challenge_id
    where gc.game_id = p_match
    for update of ans
  loop
    right_option := public.pulse_challenge_correct_option(row.scoring_rule, p_home, p_away);
    hit := row.option_id = right_option;
    bonus := case when hit then row.points else 0 end;
    if row.evaluated_at is null then
      insert into public.pulse_analytics_events (user_id, event_name, properties)
      values (
        row.user_id,
        case when hit then 'challenge_correct' else 'challenge_incorrect' end,
        jsonb_build_object('matchId', p_match, 'challengeId', row.challenge_id, 'points', bonus)
      );
      if hit then
        insert into public.pulse_analytics_events (user_id, event_name, properties)
        values (
          row.user_id,
          'challenge_bonus_awarded',
          jsonb_build_object('matchId', p_match, 'challengeId', row.challenge_id, 'points', bonus)
        );
      end if;
    end if;

    update public.pulse_challenge_answers
    set correct = hit,
        points_awarded = bonus,
        evaluated_at = coalesce(evaluated_at, now())
    where id = row.id;

    if bonus > 0 then
      insert into public.pulse_transactions (id, user_id, experience_id, source_type, source_id, points, metadata)
      values (
        'tx_chg_' || substr(md5(row.user_id || ':' || row.challenge_id), 1, 24),
        row.user_id,
        'exp_tobo',
        'game_challenge',
        row.user_id || ':' || row.challenge_id,
        bonus,
        jsonb_build_object(
          'matchId', p_match,
          'challengeId', row.challenge_id,
          'homeScore', p_home,
          'awayScore', p_away,
          'matchStartsAt', match.starts_at,
          'kind', 'GAME_CHALLENGE_CORRECT'
        )
      )
      on conflict (source_type, source_id) do update
      set points = excluded.points,
          metadata = excluded.metadata
      where public.pulse_transactions.points is distinct from excluded.points;
      awarded := awarded + bonus;
    else
      delete from public.pulse_transactions
      where source_type = 'game_challenge'
        and source_id = row.user_id || ':' || row.challenge_id;
    end if;
  end loop;

  return awarded;
end;
$$;

create or replace function public.pulse_admin_create_match(
  p_admin_key text,
  p_home text,
  p_away text,
  p_starts_at timestamptz
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
  if trim(coalesce(p_home, '')) = '' or trim(coalesce(p_away, '')) = '' or trim(p_home) = trim(p_away) then
    return jsonb_build_object('ok', false, 'error', 'Escribe dos equipos distintos.');
  end if;
  if p_starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'Indica la fecha y hora del partido.');
  end if;
  new_id := 'match_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_matches (id, home_team, away_team, starts_at)
  values (new_id, trim(p_home), trim(p_away), p_starts_at);
  perform public.pulse_assign_game_challenges(new_id);
  return jsonb_build_object('ok', true, 'id', new_id);
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

  perform public.pulse_evaluate_match_challenges(match.id, p_home_score, p_away_score);
  perform public.pulse_resolve_duels(match.id);
  return jsonb_build_object('ok', true, 'scored', scored, 'points', awarded);
end;
$$;

create or replace function public.pulse_admin_challenge_templates(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', t.code,
      'title', t.title,
      'category', t.category,
      'difficulty', t.difficulty,
      'points', t.points,
      'active', t.active,
      'usage', coalesce(use.uses, 0),
      'answers', coalesce(use.answers, 0),
      'correct', coalesce(use.correct, 0),
      'accuracy', case when coalesce(use.answers, 0) = 0 then null else round(100.0 * use.correct / use.answers) end,
      'selectionRate', case when coalesce(use.uses, 0) = 0 then null else round(100.0 * use.answers / use.uses) end
    ) order by t.category, t.points, t.code)
    from public.pulse_challenge_templates t
    left join (
      select gc.template_id,
             count(distinct gc.id)::int as uses,
             count(ans.id)::int as answers,
             count(ans.id) filter (where ans.correct)::int as correct
      from public.pulse_game_challenges gc
      left join public.pulse_challenge_answers ans on ans.game_challenge_id = gc.id and ans.evaluated_at is not null
      group by gc.template_id
    ) use on use.template_id = t.id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_admin_set_challenge_template(
  p_admin_key text,
  p_code text,
  p_active boolean,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_challenge_templates
  set active = coalesce(p_active, active),
      title = case when nullif(trim(p_title), '') is null then title else trim(p_title) end
  where code = p_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa plantilla no existe.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.pulse_match_challenges(text, text) to anon, authenticated;
grant execute on function public.pulse_save_challenge_answers(text, text, jsonb) to anon, authenticated;
grant execute on function public.pulse_admin_challenge_templates(text) to anon, authenticated;
grant execute on function public.pulse_admin_set_challenge_template(text, text, boolean, text) to anon, authenticated;

