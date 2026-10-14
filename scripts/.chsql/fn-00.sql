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

