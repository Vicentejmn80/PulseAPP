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

insert into public.pulse_challenge_templates (
  id, code, title, description, category, difficulty, points, answer_type, options, scoring_rule, required_facts, active, priority, cooldown_days, tags
) values
('cht_total_gte_7', 'TOTAL_GTE_7', '¿Habrá 7 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_8', 'TOTAL_GTE_8', '¿Habrá 8 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_9', 'TOTAL_GTE_9', '¿Habrá 9 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":9}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_10', 'TOTAL_GTE_10', '¿Habrá 10 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":10}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_11', 'TOTAL_GTE_11', '¿Se irán a 11 o más carreras?', 'Se corrige con el marcador final.', 'total', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":11}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_12', 'TOTAL_GTE_12', '¿Habrá 12 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":12}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_13', 'TOTAL_GTE_13', '¿Habrá 13 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":13}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_14', 'TOTAL_GTE_14', '¿Habrá 14 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":14}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_gte_15', 'TOTAL_GTE_15', '¿Habrá 15 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":15}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_lte_5', 'TOTAL_LTE_5', '¿El partido se queda en 5 carreras o menos?', 'Se corrige con el marcador final.', 'total', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_lte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_lte_6', 'TOTAL_LTE_6', '¿Habrá 6 o menos carreras en total?', 'Se corrige con el marcador final.', 'total', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_lte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_lte_7', 'TOTAL_LTE_7', '¿Habrá 7 o menos carreras en total?', 'Se corrige con el marcador final.', 'total', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_lte","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_lte_8', 'TOTAL_LTE_8', '¿Habrá 8 o menos carreras en total?', 'Se corrige con el marcador final.', 'total', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_lte","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_lte_9', 'TOTAL_LTE_9', '¿Se quedan en 9 carreras o menos?', 'Se corrige con el marcador final.', 'total', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_lte","n":9}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_eq_6', 'TOTAL_EQ_6', '¿El total será exactamente 6 carreras?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_eq","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_total_eq_7', 'TOTAL_EQ_7', '¿El total será exactamente 7 carreras?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_eq","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_total_eq_8', 'TOTAL_EQ_8', '¿El total será exactamente 8 carreras?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_eq","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_total_eq_9', 'TOTAL_EQ_9', '¿El total será exactamente 9 carreras?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_eq","n":9}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_total_eq_10', 'TOTAL_EQ_10', '¿El total será exactamente 10 carreras?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_eq","n":10}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_total_eq_11', 'TOTAL_EQ_11', '¿El total será exactamente 11 carreras?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_eq","n":11}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_total_eq_12', 'TOTAL_EQ_12', '¿El total será exactamente 12 carreras?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_eq","n":12}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_parity_even', 'PARITY_EVEN', '¿El total de carreras será un número par?', 'Se corrige con el marcador final.', 'total', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"parity","even":true}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_parity_odd', 'PARITY_ODD', '¿El total de carreras será un número impar?', 'Se corrige con el marcador final.', 'total', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"parity","even":false}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_total_bucket_a', 'TOTAL_BUCKET_A', '¿En qué rango cae el total de carreras?', 'Elige el rango. Se corrige con el marcador final.', 'total', 'medium', 4, 'multiple', '[{"id":"lt6","label":"Menos de 6"},{"id":"6a8","label":"6 a 8"},{"id":"9a11","label":"9 a 11"},{"id":"12p","label":"12 o más"}]'::jsonb, '{"op":"buckets","fact":"total","buckets":[{"id":"lt6","label":"Menos de 6","min":0,"max":5},{"id":"6a8","label":"6 a 8","min":6,"max":8},{"id":"9a11","label":"9 a 11","min":9,"max":11},{"id":"12p","label":"12 o más","min":12,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['total','rango']::text[]),
('cht_total_bucket_b', 'TOTAL_BUCKET_B', '¿Cuántas carreras suma el partido?', 'Elige el rango. Se corrige con el marcador final.', 'total', 'hard', 6, 'multiple', '[{"id":"0a4","label":"0 a 4"},{"id":"5a7","label":"5 a 7"},{"id":"8a10","label":"8 a 10"},{"id":"11p","label":"11 o más"}]'::jsonb, '{"op":"buckets","fact":"total","buckets":[{"id":"0a4","label":"0 a 4","min":0,"max":4},{"id":"5a7","label":"5 a 7","min":5,"max":7},{"id":"8a10","label":"8 a 10","min":8,"max":10},{"id":"11p","label":"11 o más","min":11,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['total','rango']::text[]),
('cht_total_bucket_c', 'TOTAL_BUCKET_C', '¿Dónde queda la suma de carreras?', 'Elige el rango. Se corrige con el marcador final.', 'total', 'medium', 4, 'multiple', '[{"id":"lt8","label":"Menos de 8"},{"id":"8a10","label":"8 a 10"},{"id":"11a13","label":"11 a 13"},{"id":"14p","label":"14 o más"}]'::jsonb, '{"op":"buckets","fact":"total","buckets":[{"id":"lt8","label":"Menos de 8","min":0,"max":7},{"id":"8a10","label":"8 a 10","min":8,"max":10},{"id":"11a13","label":"11 a 13","min":11,"max":13},{"id":"14p","label":"14 o más","min":14,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['total','rango']::text[]),
('cht_total_bucket_d', 'TOTAL_BUCKET_D', '¿Qué tan cargado queda el marcador?', 'Elige el rango. Se corrige con el marcador final.', 'marcador', 'hard', 6, 'multiple', '[{"id":"0a6","label":"0 a 6"},{"id":"7a9","label":"7 a 9"},{"id":"10a12","label":"10 a 12"},{"id":"13p","label":"13 o más"}]'::jsonb, '{"op":"buckets","fact":"total","buckets":[{"id":"0a6","label":"0 a 6","min":0,"max":6},{"id":"7a9","label":"7 a 9","min":7,"max":9},{"id":"10a12","label":"10 a 12","min":10,"max":12},{"id":"13p","label":"13 o más","min":13,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['marcador','rango']::text[]),
('cht_margin_eq_1', 'MARGIN_EQ_1', '¿El ganador se impondrá por una carrera?', 'Se corrige con el marcador final.', 'cerrado', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_eq","n":1}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['cerrado']::text[]),
('cht_margin_eq_2', 'MARGIN_EQ_2', '¿La diferencia final será de exactamente 2?', 'Se corrige con el marcador final.', 'diferencia', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_eq","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['diferencia']::text[]),
('cht_margin_eq_3', 'MARGIN_EQ_3', '¿La diferencia final será de exactamente 3?', 'Se corrige con el marcador final.', 'diferencia', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_eq","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['diferencia']::text[]),
('cht_margin_eq_4', 'MARGIN_EQ_4', '¿La diferencia final será de exactamente 4?', 'Se corrige con el marcador final.', 'diferencia', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_eq","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['diferencia']::text[]),
('cht_margin_eq_5', 'MARGIN_EQ_5', '¿La diferencia final será de exactamente 5?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_eq","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_margin_gte_2', 'MARGIN_GTE_2', '¿El ganador sacará al menos 2 de ventaja?', 'Se corrige con el marcador final.', 'diferencia', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_gte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['diferencia']::text[]),
('cht_margin_gte_3', 'MARGIN_GTE_3', '¿El ganador tendrá ventaja de 3 o más?', 'Se corrige con el marcador final.', 'diferencia', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_gte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['diferencia']::text[]),
('cht_margin_gte_4', 'MARGIN_GTE_4', '¿Habrá diferencia de 4 o más carreras?', 'Se corrige con el marcador final.', 'abierto', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_gte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_margin_gte_5', 'MARGIN_GTE_5', '¿La ventaja final será de 5 o más?', 'Se corrige con el marcador final.', 'abierto', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_gte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_margin_gte_6', 'MARGIN_GTE_6', '¿Alguien se irá con 6 o más de ventaja?', 'Se corrige con el marcador final.', 'abierto', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_gte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_margin_gte_7', 'MARGIN_GTE_7', '¿La diferencia llegará a 7 o más?', 'Se corrige con el marcador final.', 'abierto', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_gte","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_margin_gte_8', 'MARGIN_GTE_8', '¿Habrá una ventaja de 8 o más carreras?', 'Se corrige con el marcador final.', 'abierto', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_gte","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_margin_lte_2', 'MARGIN_LTE_2', '¿La diferencia final será de 2 o menos?', 'Se corrige con el marcador final.', 'cerrado', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_lte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['cerrado']::text[]),
('cht_margin_lte_3', 'MARGIN_LTE_3', '¿La ventaja final será de 3 o menos?', 'Se corrige con el marcador final.', 'cerrado', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_lte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['cerrado']::text[]),
('cht_margin_bucket_a', 'MARGIN_BUCKET_A', '¿De cuánto será la diferencia final?', 'Elige el rango. Se corrige con el marcador final.', 'diferencia', 'medium', 4, 'multiple', '[{"id":"m1","label":"1 carrera"},{"id":"m2","label":"2 carreras"},{"id":"m3","label":"3 carreras"},{"id":"m4","label":"4 o más"}]'::jsonb, '{"op":"buckets","fact":"margin","buckets":[{"id":"m1","label":"1 carrera","min":1,"max":1},{"id":"m2","label":"2 carreras","min":2,"max":2},{"id":"m3","label":"3 carreras","min":3,"max":3},{"id":"m4","label":"4 o más","min":4,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['diferencia','rango']::text[]),
('cht_margin_bucket_b', 'MARGIN_BUCKET_B', '¿Qué tan holgado queda el final?', 'Elige el rango. Se corrige con el marcador final.', 'diferencia', 'hard', 6, 'multiple', '[{"id":"1a2","label":"1 o 2"},{"id":"3a4","label":"3 o 4"},{"id":"5a6","label":"5 o 6"},{"id":"7p","label":"7 o más"}]'::jsonb, '{"op":"buckets","fact":"margin","buckets":[{"id":"1a2","label":"1 o 2","min":1,"max":2},{"id":"3a4","label":"3 o 4","min":3,"max":4},{"id":"5a6","label":"5 o 6","min":5,"max":6},{"id":"7p","label":"7 o más","min":7,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['diferencia','rango']::text[]),
('cht_winner_gte_4', 'WINNER_GTE_4', '¿El ganador anotará 4 o más?', 'Se corrige con el marcador final.', 'resultado', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_gte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_gte_5', 'WINNER_GTE_5', '¿El ganador anotará 5 o más?', 'Se corrige con el marcador final.', 'resultado', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_gte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_gte_6', 'WINNER_GTE_6', '¿El ganador llegará a 6 o más?', 'Se corrige con el marcador final.', 'resultado', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_gte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_gte_7', 'WINNER_GTE_7', '¿El ganador anotará 7 o más?', 'Se corrige con el marcador final.', 'resultado', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_gte","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_gte_8', 'WINNER_GTE_8', '¿El ganador llegará a 8 o más?', 'Se corrige con el marcador final.', 'resultado', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_gte","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_gte_9', 'WINNER_GTE_9', '¿El ganador anotará 9 o más?', 'Se corrige con el marcador final.', 'resultado', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_gte","n":9}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_lte_3', 'WINNER_LTE_3', '¿El ganador se quedará en 3 o menos?', 'Se corrige con el marcador final.', 'resultado', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_lte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_lte_4', 'WINNER_LTE_4', '¿Al ganador le bastan 4 o menos?', 'Se corrige con el marcador final.', 'resultado', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_lte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_winner_bucket', 'WINNER_BUCKET', '¿Cuántas anota el ganador?', 'Elige el rango. Se corrige con el marcador final.', 'resultado', 'medium', 4, 'multiple', '[{"id":"1a3","label":"1 a 3"},{"id":"4a6","label":"4 a 6"},{"id":"7a9","label":"7 a 9"},{"id":"10p","label":"10 o más"}]'::jsonb, '{"op":"buckets","fact":"winner_runs","buckets":[{"id":"1a3","label":"1 a 3","min":1,"max":3},{"id":"4a6","label":"4 a 6","min":4,"max":6},{"id":"7a9","label":"7 a 9","min":7,"max":9},{"id":"10p","label":"10 o más","min":10,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['resultado','rango']::text[]),
('cht_loser_lte_1', 'LOSER_LTE_1', '¿El perdedor se quedará en 1 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"loser_lte","n":1}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_loser_lte_2', 'LOSER_LTE_2', '¿El perdedor anotará 2 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"loser_lte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_loser_lte_3', 'LOSER_LTE_3', '¿El perdedor se queda en 3 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"loser_lte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_loser_gte_3', 'LOSER_GTE_3', '¿El perdedor anotará 3 o más?', 'Se corrige con el marcador final.', 'marcador', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"loser_gte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_loser_gte_4', 'LOSER_GTE_4', '¿El que pierda igual anota 4 o más?', 'Se corrige con el marcador final.', 'marcador', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"loser_gte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_loser_gte_5', 'LOSER_GTE_5', '¿El perdedor llegará a 5 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"loser_gte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_loser_bucket', 'LOSER_BUCKET', '¿Cuántas anota el perdedor?', 'Elige el rango. Se corrige con el marcador final.', 'marcador', 'hard', 6, 'multiple', '[{"id":"0a1","label":"0 o 1"},{"id":"2a3","label":"2 o 3"},{"id":"4a5","label":"4 o 5"},{"id":"6p","label":"6 o más"}]'::jsonb, '{"op":"buckets","fact":"loser_runs","buckets":[{"id":"0a1","label":"0 o 1","min":0,"max":1},{"id":"2a3","label":"2 o 3","min":2,"max":3},{"id":"4a5","label":"4 o 5","min":4,"max":5},{"id":"6p","label":"6 o más","min":6,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['marcador','rango']::text[]),
('cht_both_gte_1', 'BOTH_GTE_1', '¿Los dos equipos van a anotar?', 'Se corrige con el marcador final.', 'marcador', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_gte","n":1}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_both_gte_2', 'BOTH_GTE_2', '¿Ambos equipos anotarán al menos 2?', 'Se corrige con el marcador final.', 'ofensiva', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_gte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_both_gte_3', 'BOTH_GTE_3', '¿Ambos equipos anotarán al menos 3?', 'Se corrige con el marcador final.', 'ofensiva', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_gte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_both_gte_4', 'BOTH_GTE_4', '¿Ambos equipos llegarán a 4 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_gte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_both_gte_5', 'BOTH_GTE_5', '¿Ambos equipos anotarán 5 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_gte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_both_lte_2', 'BOTH_LTE_2', '¿Ningún equipo pasa de 2 carreras?', 'Se corrige con el marcador final.', 'defensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_lte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_both_lte_3', 'BOTH_LTE_3', '¿Ningún equipo llega a 4 carreras?', 'Se corrige con el marcador final.', 'defensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_lte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_both_lte_4', 'BOTH_LTE_4', '¿Ningún equipo anota más de 4?', 'Se corrige con el marcador final.', 'defensiva', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_lte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_either_gte_5', 'EITHER_GTE_5', '¿Algún equipo anotará 5 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"either_gte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_either_gte_6', 'EITHER_GTE_6', '¿Algún equipo llegará a 6 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"either_gte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_either_gte_7', 'EITHER_GTE_7', '¿Algún equipo anotará 7 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"either_gte","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_either_gte_8', 'EITHER_GTE_8', '¿Algún equipo llegará a 8 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"either_gte","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_either_gte_9', 'EITHER_GTE_9', '¿Algún equipo anotará 9 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"either_gte","n":9}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_either_gte_10', 'EITHER_GTE_10', '¿Algún equipo llegará a 10 carreras?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"either_gte","n":10}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_shutout', 'SHUTOUT', '¿Algún equipo terminará en cero?', 'Se corrige con el marcador final.', 'defensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"shutout"}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_home_zero', 'HOME_ZERO', '¿El local termina en cero?', 'Se corrige con el marcador final.', 'defensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_eq","n":0}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_away_zero', 'AWAY_ZERO', '¿El visitante termina en cero?', 'Se corrige con el marcador final.', 'defensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_eq","n":0}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_home_gte_2', 'HOME_GTE_2', '¿El local anota al menos 2?', 'Se corrige con el marcador final.', 'marcador', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_gte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_home_gte_3', 'HOME_GTE_3', '¿El local anota 3 o más?', 'Se corrige con el marcador final.', 'marcador', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_gte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_home_gte_4', 'HOME_GTE_4', '¿El local anota 4 o más?', 'Se corrige con el marcador final.', 'marcador', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_gte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_home_gte_5', 'HOME_GTE_5', '¿El local llega a 5 o más?', 'Se corrige con el marcador final.', 'marcador', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_gte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_home_gte_6', 'HOME_GTE_6', '¿El local anota 6 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_gte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_home_gte_7', 'HOME_GTE_7', '¿El local llega a 7 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_gte","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_home_lte_2', 'HOME_LTE_2', '¿El local se queda en 2 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_lte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_home_lte_3', 'HOME_LTE_3', '¿El local anota 3 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_lte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_away_gte_2', 'AWAY_GTE_2', '¿El visitante anota al menos 2?', 'Se corrige con el marcador final.', 'marcador', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_gte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_away_gte_3', 'AWAY_GTE_3', '¿El visitante anota 3 o más?', 'Se corrige con el marcador final.', 'marcador', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_gte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_away_gte_4', 'AWAY_GTE_4', '¿El visitante anota 4 o más?', 'Se corrige con el marcador final.', 'marcador', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_gte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_away_gte_5', 'AWAY_GTE_5', '¿El visitante llega a 5 o más?', 'Se corrige con el marcador final.', 'marcador', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_gte","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['marcador']::text[]),
('cht_away_gte_6', 'AWAY_GTE_6', '¿El visitante anota 6 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_gte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_away_gte_7', 'AWAY_GTE_7', '¿El visitante llega a 7 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_gte","n":7}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_away_lte_2', 'AWAY_LTE_2', '¿El visitante se queda en 2 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_lte","n":2}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_away_lte_3', 'AWAY_LTE_3', '¿El visitante anota 3 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_lte","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_home_bucket', 'HOME_BUCKET', '¿Cuántas anota el local?', 'Elige el rango. Se corrige con el marcador final.', 'marcador', 'medium', 4, 'multiple', '[{"id":"0a2","label":"0 a 2"},{"id":"3a5","label":"3 a 5"},{"id":"6a8","label":"6 a 8"},{"id":"9p","label":"9 o más"}]'::jsonb, '{"op":"buckets","fact":"home","buckets":[{"id":"0a2","label":"0 a 2","min":0,"max":2},{"id":"3a5","label":"3 a 5","min":3,"max":5},{"id":"6a8","label":"6 a 8","min":6,"max":8},{"id":"9p","label":"9 o más","min":9,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['marcador','rango']::text[]),
('cht_away_bucket', 'AWAY_BUCKET', '¿Cuántas anota el visitante?', 'Elige el rango. Se corrige con el marcador final.', 'marcador', 'medium', 4, 'multiple', '[{"id":"0a2","label":"0 a 2"},{"id":"3a5","label":"3 a 5"},{"id":"6a8","label":"6 a 8"},{"id":"9p","label":"9 o más"}]'::jsonb, '{"op":"buckets","fact":"away","buckets":[{"id":"0a2","label":"0 a 2","min":0,"max":2},{"id":"3a5","label":"3 a 5","min":3,"max":5},{"id":"6a8","label":"6 a 8","min":6,"max":8},{"id":"9p","label":"9 o más","min":9,"max":null}]}'::jsonb, array['home_score','away_score']::text[], true, 1, 2, array['marcador','rango']::text[]),
('cht_closed_busy', 'CLOSED_BUSY', '¿Habrá 8 o más carreras y diferencia de una?', 'Se corrige con el marcador final.', 'cerrado', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"total_gte","n":8},{"op":"margin_eq","n":1}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['cerrado']::text[]),
('cht_closed_both3', 'CLOSED_BOTH3', '¿Ambos anotan 3 o más y la diferencia es de 2 o menos?', 'Se corrige con el marcador final.', 'cerrado', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"both_gte","n":3},{"op":"margin_lte","n":2}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['cerrado']::text[]),
('cht_one_run_both', 'ONE_RUN_BOTH', '¿Los dos anotan y el final se decide por una?', 'Se corrige con el marcador final.', 'cerrado', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"both_gte","n":1},{"op":"margin_eq","n":1}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['cerrado']::text[]),
('cht_closed_high', 'CLOSED_HIGH', '¿Habrá 9 o más carreras con diferencia de 3 o menos?', 'Se corrige con el marcador final.', 'cerrado', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"total_gte","n":9},{"op":"margin_lte","n":3}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['cerrado']::text[]),
('cht_open_winner7', 'OPEN_WINNER7', '¿El ganador llega a 7 con ventaja de 4 o más?', 'Se corrige con el marcador final.', 'abierto', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"winner_gte","n":7},{"op":"margin_gte","n":4}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_doubles', 'DOUBLES', '¿El ganador le dobla las carreras al perdedor?', 'El perdedor anota al menos una y el ganador llega al doble.', 'abierto', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_doubles"}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_open_quiet_loser', 'OPEN_QUIET_LOSER', '¿Habrá ventaja de 3 o más y el perdedor en 2 o menos?', 'Se corrige con el marcador final.', 'abierto', 'medium', 4, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"margin_gte","n":3},{"op":"loser_lte","n":2}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['abierto']::text[]),
('cht_shutout_five', 'SHUTOUT_FIVE', '¿Habrá blanqueada y el ganador anota 5 o más?', 'Se corrige con el marcador final.', 'defensiva', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"shutout"},{"op":"winner_gte","n":5}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_offense_both4_close', 'OFFENSE_BOTH4_CLOSE', '¿Ambos llegan a 4 y el partido no se abre a más de 2?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"both_gte","n":4},{"op":"margin_lte","n":2}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_low_and_close', 'LOW_AND_CLOSE', '¿Habrá 6 o menos carreras y diferencia de 2 o menos?', 'Se corrige con el marcador final.', 'defensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"total_lte","n":6},{"op":"margin_lte","n":2}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_home_burst', 'HOME_BURST', '¿El local anota 6 o más y el visitante se queda en 3 o menos?', 'Se corrige con el marcador final.', 'resultado', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"home_gte","n":6},{"op":"away_lte","n":3}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_away_burst', 'AWAY_BURST', '¿El visitante anota 6 o más y el local se queda en 3 o menos?', 'Se corrige con el marcador final.', 'resultado', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"away_gte","n":6},{"op":"home_lte","n":3}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_home_exact_3', 'HOME_EXACT_3', '¿El local anota exactamente 3?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_eq","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_away_exact_3', 'AWAY_EXACT_3', '¿El visitante anota exactamente 3?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_eq","n":3}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_home_exact_4', 'HOME_EXACT_4', '¿El local anota exactamente 4?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_eq","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_away_exact_4', 'AWAY_EXACT_4', '¿El visitante anota exactamente 4?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_eq","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_home_exact_5', 'HOME_EXACT_5', '¿El local anota exactamente 5?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_eq","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_away_exact_5', 'AWAY_EXACT_5', '¿El visitante anota exactamente 5?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_eq","n":5}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_ten_plus_close', 'TEN_PLUS_CLOSE', '¿Habrá 10 o más carreras con diferencia de 2 o menos?', 'Se corrige con el marcador final.', 'total', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"total_gte","n":10},{"op":"margin_lte","n":2}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_five_each_side', 'FIVE_EACH_SIDE', '¿Los dos equipos llegan al menos a 4 y el total pasa de 9?', 'Se corrige con el marcador final.', 'ofensiva', 'hard', 6, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"both_gte","n":4},{"op":"total_gte","n":10}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_winner_exact_double', 'WINNER_EXACT_DOUBLE', '¿El perdedor anota 3 o más y el ganador le dobla?', 'Se corrige con el marcador final.', 'dificultad', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"and","rules":[{"op":"loser_gte","n":3},{"op":"winner_doubles"},{"op":"margin_gte","n":3}]}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['dificultad']::text[]),
('cht_margin_eq_6', 'MARGIN_EQ_6', '¿La diferencia final será de exactamente 6?', 'Se corrige con el marcador final.', 'diferencia', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_eq","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['diferencia']::text[]),
('cht_total_gte_16', 'TOTAL_GTE_16', '¿Habrá 16 o más carreras en total?', 'Se corrige con el marcador final.', 'total', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_gte","n":16}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['total']::text[]),
('cht_both_gte_6', 'BOTH_GTE_6', '¿Ambos equipos anotarán 6 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"both_gte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_loser_gte_6', 'LOSER_GTE_6', '¿Hasta el perdedor anota 6 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"loser_gte","n":6}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_home_gte_8', 'HOME_GTE_8', '¿El local llega a 8 o más?', 'Se corrige con el marcador final.', 'resultado', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"home_gte","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_away_gte_8', 'AWAY_GTE_8', '¿El visitante llega a 8 o más?', 'Se corrige con el marcador final.', 'resultado', 'expert', 8, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"away_gte","n":8}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_total_lte_4', 'TOTAL_LTE_4', '¿El partido se queda en 4 carreras o menos?', 'Se corrige con el marcador final.', 'defensiva', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"total_lte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['defensiva']::text[]),
('cht_either_gte_4', 'EITHER_GTE_4', '¿Algún equipo anota 4 o más?', 'Se corrige con el marcador final.', 'ofensiva', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"either_gte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['ofensiva']::text[]),
('cht_winner_gte_10', 'WINNER_GTE_10', '¿El ganador llega a 10 o más?', 'Se corrige con el marcador final.', 'resultado', 'expert', 10, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"winner_gte","n":10}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['resultado']::text[]),
('cht_margin_lte_4', 'MARGIN_LTE_4', '¿La diferencia se queda en 4 o menos?', 'Se corrige con el marcador final.', 'diferencia', 'easy', 2, 'boolean', '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb, '{"op":"margin_lte","n":4}'::jsonb, array['home_score','away_score']::text[], true, 0, 2, array['diferencia']::text[])
on conflict (code) do nothing;

do $$
declare game_id text;
begin
  if exists (
    select 1 from public.pulse_challenge_templates
    where active and (scoring_rule is null or scoring_rule->>'op' is null)
  ) then
    raise exception 'Hay una plantilla activa sin scoring_rule';
  end if;
  for game_id in
    select id from public.pulse_matches
    where status in ('scheduled', 'postponed')
  loop
    perform public.pulse_assign_game_challenges(game_id);
  end loop;
end $$;
