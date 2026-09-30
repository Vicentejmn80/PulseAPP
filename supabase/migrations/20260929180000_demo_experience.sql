alter table public.pulse_matches
  add column if not exists is_demo boolean not null default false;

alter table public.pulse_venues
  add column if not exists slug text not null default '',
  add column if not exists logo_url text not null default '',
  add column if not exists image_url text not null default '',
  add column if not exists description text not null default '',
  add column if not exists city text not null default '',
  add column if not exists sponsor_text text not null default '',
  add column if not exists prize_detail text not null default '',
  add column if not exists prize_quantity integer not null default 0,
  add column if not exists prize_terms text not null default '',
  add column if not exists prize_starts date,
  add column if not exists prize_ends date,
  add column if not exists cycle_id text not null default 'ronda_1';

create unique index if not exists pulse_venues_slug_key
  on public.pulse_venues (slug)
  where slug <> '';

create table if not exists public.pulse_demo_sessions (
  id text primary key,
  match_id text not null references public.pulse_matches (id) on delete cascade,
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  seed text not null,
  script jsonb not null,
  status text not null default 'live' check (status in ('live', 'finished')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  hits integer not null default 0,
  answered integer not null default 0,
  bonus integer not null default 0,
  unique (match_id, user_id)
);

create table if not exists public.pulse_demo_answers (
  id text primary key,
  session_id text not null references public.pulse_demo_sessions (id) on delete cascade,
  question_id text not null,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (session_id, question_id)
);

alter table public.pulse_demo_sessions enable row level security;
alter table public.pulse_demo_answers enable row level security;

create or replace function public.pulse_protect_demo_result()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.is_demo, false)
     and (
       new.home_score is not null
       or new.away_score is not null
       or new.status is distinct from old.status
     ) then
    raise exception 'Una simulación no escribe el resultado oficial.';
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_protect_demo_result on public.pulse_matches;
create trigger pulse_protect_demo_result
before update on public.pulse_matches
for each row execute function public.pulse_protect_demo_result();

create or replace function public.pulse_lock_due_matches()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pulse_matches
  set status = 'locked', updated_at = now()
  where status = 'scheduled' and starts_at <= now() and not is_demo;

  update public.pulse_match_predictions pred
  set locked_at = match.starts_at
  from public.pulse_matches match
  where pred.match_id = match.id
    and pred.locked_at is null
    and not match.is_demo
    and (match.status in ('locked', 'finished') or match.starts_at <= now());
end;
$$;

create or replace function public.pulse_save_prediction(
  p_token text,
  p_match_id text,
  p_winner text,
  p_home_score integer,
  p_away_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  match public.pulse_matches;
  winner text;
begin
  perform public.pulse_lock_due_matches();
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Entra de nuevo para guardar el pronóstico.');
  end if;
  select * into match from public.pulse_matches where id = p_match_id for update;
  if match.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese juego no existe.');
  end if;
  if match.is_demo and exists (
    select 1 from public.pulse_demo_sessions session
    where session.match_id = match.id and session.user_id = uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'El pronóstico de esta experiencia ya quedó guardado.');
  end if;
  if match.status in ('finished', 'cancelled', 'locked')
     or (not match.is_demo and match.starts_at <= now()) then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. El pronóstico está cerrado.');
  end if;
  if match.is_demo and match.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'error', 'Este juego no está abierto para pronosticar.');
  end if;
  if not match.is_demo and match.status not in ('scheduled', 'postponed') then
    return jsonb_build_object('ok', false, 'error', 'Este juego no está abierto para pronosticar.');
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 99 or p_away_score > 99 then
    return jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un número entero entre 0 y 99.');
  end if;
  if p_home_score = p_away_score then
    return jsonb_build_object('ok', false, 'error', 'En béisbol no se pronostica empate.');
  end if;
  winner := trim(p_winner);
  if winner <> match.home_team and winner <> match.away_team then
    return jsonb_build_object('ok', false, 'error', 'Elige uno de los dos equipos.');
  end if;
  if (p_home_score > p_away_score and winner <> match.home_team)
     or (p_away_score > p_home_score and winner <> match.away_team) then
    return jsonb_build_object('ok', false, 'error', 'El ganador no coincide con el marcador.');
  end if;

  insert into public.pulse_match_predictions (
    id, user_id, match_id, predicted_winner, predicted_home_score, predicted_away_score
  ) values (
    'pred_' || replace(gen_random_uuid()::text, '-', ''),
    uid, match.id, winner, p_home_score, p_away_score
  )
  on conflict (user_id, match_id) do update
  set predicted_winner = excluded.predicted_winner,
      predicted_home_score = excluded.predicted_home_score,
      predicted_away_score = excluded.predicted_away_score,
      updated_at = now()
  where pulse_match_predictions.processed_at is null
    and pulse_match_predictions.locked_at is null;

  if not exists (
    select 1 from public.pulse_match_predictions saved
    where saved.user_id = uid
      and saved.match_id = match.id
      and saved.predicted_winner = winner
      and saved.predicted_home_score = p_home_score
      and saved.predicted_away_score = p_away_score
      and saved.locked_at is null
      and saved.processed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'El juego ya comenzó. El pronóstico está cerrado.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
