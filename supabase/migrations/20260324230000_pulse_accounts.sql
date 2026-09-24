create table if not exists public.pulse_profiles (
  id text primary key,
  phone text not null unique,
  alias text not null,
  handle text not null,
  initials text not null,
  avatar_color text not null,
  access_code text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_sessions (
  token text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_participations (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  experience_id text not null,
  game_id text not null,
  type text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create table if not exists public.pulse_transactions (
  id text primary key,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  experience_id text,
  source_type text not null,
  source_id text not null,
  points integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_completed_missions (
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  mission_id text not null,
  primary key (user_id, mission_id)
);

create table if not exists public.pulse_prediction_picks (
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  game_id text not null,
  option_id text not null,
  primary key (user_id, game_id)
);

create table if not exists public.pulse_extra_games (
  id text primary key,
  game jsonb not null
);

alter table public.pulse_profiles enable row level security;
alter table public.pulse_sessions enable row level security;
alter table public.pulse_participations enable row level security;
alter table public.pulse_transactions enable row level security;
alter table public.pulse_completed_missions enable row level security;
alter table public.pulse_prediction_picks enable row level security;
alter table public.pulse_extra_games enable row level security;

create or replace function public.pulse_normalize_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  if digits like '00%' then digits := substring(digits from 3); end if;
  if length(digits) = 11 and digits like '0%' then digits := '58' || substring(digits from 2); end if;
  if length(digits) = 10 and digits like '4%' then digits := '58' || digits; end if;
  if digits ~ '^58\d{10}$' then return '+' || digits; end if;
  return '';
end;
$$;

create or replace function public.pulse_random_code()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

create or replace function public.pulse_initials(alias text)
returns text
language sql
immutable
as $$
  select upper(
    coalesce(substr(split_part(trim(alias), ' ', 1), 1, 1), 'P')
    || coalesce(substr(split_part(trim(alias), ' ', 2), 1, 1), substr(split_part(trim(alias), ' ', 1), 2, 1), '')
  );
$$;

create or replace function public.pulse_make_handle(alias text)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  n integer := 2;
begin
  base := lower(regexp_replace(trim(alias), '[^a-zA-Z0-9]+', '', 'g'));
  if base = '' then base := 'jugador'; end if;
  base := substr(base, 1, 16);
  candidate := '@' || base;
  while exists (select 1 from public.pulse_profiles where handle = candidate) loop
    candidate := '@' || base || n::text;
    n := n + 1;
  end loop;
  return candidate;
end;
$$;

create or replace function public.pulse_public_profile(profile_row public.pulse_profiles)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', profile_row.id,
    'alias', profile_row.alias,
    'handle', profile_row.handle,
    'initials', profile_row.initials,
    'avatarColor', profile_row.avatar_color
  );
$$;

create or replace function public.pulse_profile_private(profile_row public.pulse_profiles)
returns jsonb
language sql
immutable
as $$
  select public.pulse_public_profile(profile_row)
    || jsonb_build_object('phone', profile_row.phone, 'accessCode', profile_row.access_code);
$$;

create or replace function public.pulse_snapshot(p_user_id text, p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.pulse_profiles;
begin
  select * into me from public.pulse_profiles where id = p_user_id;
  if me.id is null then
    return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', p_token,
    'currentUser', public.pulse_profile_private(me),
    'users', coalesce((
      select jsonb_agg(public.pulse_public_profile(p) order by p.created_at)
      from public.pulse_profiles p
    ), '[]'::jsonb),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', part.id,
        'userId', part.user_id,
        'experienceId', part.experience_id,
        'gameId', part.game_id,
        'type', part.type,
        'createdAt', to_char(part.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'metadata', part.metadata
      ) order by part.created_at)
      from public.pulse_participations part
      where part.user_id = p_user_id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tx.id,
        'userId', tx.user_id,
        'experienceId', tx.experience_id,
        'sourceType', tx.source_type,
        'sourceId', tx.source_id,
        'points', tx.points,
        'createdAt', to_char(tx.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) order by tx.created_at)
      from public.pulse_transactions tx
      where tx.user_id = p_user_id
    ), '[]'::jsonb),
    'completedMissionIds', coalesce((
      select jsonb_agg(cm.mission_id)
      from public.pulse_completed_missions cm
      where cm.user_id = p_user_id
    ), '[]'::jsonb),
    'predictionPicks', coalesce((
      select jsonb_object_agg(pp.game_id, pp.option_id)
      from public.pulse_prediction_picks pp
      where pp.user_id = p_user_id
    ), '{}'::jsonb),
    'extraGames', coalesce((
      select jsonb_agg(eg.game order by eg.id)
      from public.pulse_extra_games eg
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_register(p_phone text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_alias text;
  profile public.pulse_profiles;
  token text;
  colors text[] := array['#FF5A78', '#FF8A3D', '#5C4DDB', '#1F9D62', '#E0A106', '#241710'];
  color_count integer;
begin
  v_phone := public.pulse_normalize_phone(p_phone);
  v_alias := trim(regexp_replace(coalesce(p_alias, ''), '\s+', ' ', 'g'));
  if v_phone = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe un celular de Venezuela, por ejemplo 0412 000 0000.');
  end if;
  if length(v_alias) < 2 or length(v_alias) > 24 then
    return jsonb_build_object('ok', false, 'error', 'El alias público necesita entre 2 y 24 caracteres.');
  end if;
  if exists (select 1 from public.pulse_profiles pr where pr.phone = v_phone) then
    return jsonb_build_object('ok', false, 'error', 'Ese número ya tiene perfil. Entra con tu clave.');
  end if;

  select count(*) into color_count from public.pulse_profiles;
  profile.id := 'user_' || replace(gen_random_uuid()::text, '-', '');
  profile.phone := v_phone;
  profile.alias := v_alias;
  profile.handle := public.pulse_make_handle(v_alias);
  profile.initials := public.pulse_initials(v_alias);
  profile.avatar_color := colors[1 + (color_count % array_length(colors, 1))];
  profile.access_code := public.pulse_random_code();

  insert into public.pulse_profiles (id, phone, alias, handle, initials, avatar_color, access_code)
  values (profile.id, profile.phone, profile.alias, profile.handle, profile.initials, profile.avatar_color, profile.access_code);
  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id) values (token, profile.id);

  return public.pulse_snapshot(profile.id, token);
end;
$$;

create or replace function public.pulse_login(p_phone text, p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_code text;
  profile public.pulse_profiles;
  token text;
begin
  v_phone := public.pulse_normalize_phone(p_phone);
  v_code := upper(trim(coalesce(p_access_code, '')));
  select * into profile from public.pulse_profiles pr where pr.phone = v_phone and pr.access_code = v_code;
  if profile.id is null then
    return jsonb_build_object('ok', false, 'error', 'No coincide el número y la clave.');
  end if;
  token := 'sess_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.pulse_sessions (token, user_id) values (token, profile.id);
  return public.pulse_snapshot(profile.id, token);
end;
$$;

create or replace function public.pulse_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.pulse_sessions;
begin
  select * into session_row from public.pulse_sessions where token = p_token;
  if session_row.token is null then
    return jsonb_build_object('ok', false, 'error', 'La sesión expiró. Entra de nuevo.');
  end if;
  return public.pulse_snapshot(session_row.user_id, session_row.token);
end;
$$;

grant execute on function public.pulse_register(text, text) to anon, authenticated;
grant execute on function public.pulse_login(text, text) to anon, authenticated;
grant execute on function public.pulse_load(text) to anon, authenticated;
