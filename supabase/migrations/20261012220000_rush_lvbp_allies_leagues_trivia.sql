-- Archiva La Europea Beethoven (sin borrar historial),
-- invita a ligas por alias, tope de 50 miembros,
-- y desactiva la trivia de Águilas negro/amarillo (fuera del banco).

create or replace function public.pulse_is_mvp_venue(p_id text, p_name text)
returns boolean
language sql
stable
as $$
  select
    p_id = 'venue-garrison'
    and lower(btrim(translate(coalesce(p_name, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))) = 'garrison barber society';
$$;

update public.pulse_venues
set active = false
where id = 'venue-beethoven';

alter table public.pulse_trivia_questions
  add column if not exists review_note text;

update public.pulse_trivia_questions
set
  status = 'disabled',
  review_note = 'no verificada'
where id = '25b34f03-6546-4be4-9392-a20d64570007';

create table if not exists public.pulse_league_user_invites (
  id text primary key,
  league_id text not null references public.pulse_leagues(id) on delete cascade,
  inviter_id text not null,
  invitee_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create unique index if not exists pulse_league_user_invites_pending
  on public.pulse_league_user_invites (league_id, invitee_id)
  where status = 'pending';

create index if not exists pulse_league_user_invites_invitee
  on public.pulse_league_user_invites (invitee_id, status, expires_at);

alter table public.pulse_league_user_invites enable row level security;

create table if not exists public.pulse_league_search_log (
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists pulse_league_search_log_user_min
  on public.pulse_league_search_log (user_id, created_at desc);

alter table public.pulse_league_search_log enable row level security;

create or replace function public.pulse_league_payload(p_league_id text, p_user_id text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', league.id,
    'name', league.name,
    'code', league.code,
    'ownerUserId', league.owner_user_id,
    'memberCount', (select count(*) from public.pulse_league_members member where member.league_id = league.id),
    'isOwner', league.owner_user_id = p_user_id
  )
  from public.pulse_leagues league
  where league.id = p_league_id;
$$;

create or replace function public.pulse_league_preview(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.pulse_league_invites%rowtype;
  league public.pulse_leagues%rowtype;
  members int;
  owner_alias text;
begin
  select * into invite
  from public.pulse_league_invites
  where code = upper(trim(p_code));

  if invite is null then
    return jsonb_build_object('ok', false, 'error', 'Ese código no es válido.');
  end if;

  if invite.expires_at is not null and invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Ese código ya venció.');
  end if;

  select * into league from public.pulse_leagues where id = invite.league_id;
  if league is null then
    return jsonb_build_object('ok', false, 'error', 'Ese código no es válido.');
  end if;

  select count(*)::int into members
  from public.pulse_league_members
  where league_id = league.id;

  select alias into owner_alias
  from public.pulse_profiles
  where id = league.owner_user_id;

  return jsonb_build_object(
    'ok', true,
    'name', league.name,
    'code', league.code,
    'memberCount', members,
    'inviter', coalesce(owner_alias, 'un rusher'),
    'full', members >= 50
  );
end;
$$;

create or replace function public.pulse_league_join(p_token text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_invite public.pulse_league_invites%rowtype;
  v_members int;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para unirte a la liga.');
  end if;

  select * into v_invite
  from public.pulse_league_invites
  where code = upper(trim(p_code));

  if v_invite is null then
    return jsonb_build_object('ok', false, 'error', 'Ese código no es válido.');
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Ese código ya venció.');
  end if;

  if exists (
    select 1 from public.pulse_league_members
    where league_id = v_invite.league_id and user_id = v_user_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'alreadyMember', true,
      'league', public.pulse_league_payload(v_invite.league_id, v_user_id)
    );
  end if;

  select count(*)::int into v_members
  from public.pulse_league_members
  where league_id = v_invite.league_id;

  if v_members >= 50 or v_invite.used_count >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'error', 'La liga ya está llena.');
  end if;

  insert into public.pulse_league_members (league_id, user_id)
  values (v_invite.league_id, v_user_id);

  update public.pulse_league_invites
  set used_count = used_count + 1
  where code = v_invite.code;

  return jsonb_build_object(
    'ok', true,
    'league', public.pulse_league_payload(v_invite.league_id, v_user_id)
  );
end;
$$;

create or replace function public.pulse_league_invite_search(p_token text, p_league_id text, p_prefix text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_prefix text;
  v_recent int;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'aliases', '[]'::jsonb);
  end if;

  if not exists (
    select 1 from public.pulse_league_members
    where league_id = p_league_id and user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'aliases', '[]'::jsonb);
  end if;

  v_prefix := lower(btrim(coalesce(p_prefix, '')));
  if char_length(v_prefix) < 3 then
    return jsonb_build_object('ok', true, 'aliases', '[]'::jsonb);
  end if;

  select count(*)::int into v_recent
  from public.pulse_league_search_log
  where user_id = v_user_id and created_at > now() - interval '1 minute';

  if v_recent >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Espera un momento para buscar de nuevo.', 'aliases', '[]'::jsonb);
  end if;

  insert into public.pulse_league_search_log (user_id) values (v_user_id);

  return jsonb_build_object(
    'ok', true,
    'aliases', coalesce((
      select jsonb_agg(jsonb_build_object('alias', profile.alias) order by profile.alias)
      from (
        select profile.alias
        from public.pulse_profiles profile
        where lower(profile.alias) like v_prefix || '%'
          and profile.id <> v_user_id
          and not exists (
            select 1 from public.pulse_league_members member
            where member.league_id = p_league_id and member.user_id = profile.id
          )
          and not exists (
            select 1 from public.pulse_league_user_invites invite
            where invite.league_id = p_league_id
              and invite.invitee_id = profile.id
              and invite.status = 'pending'
              and invite.expires_at > now()
          )
        order by profile.alias
        limit 5
      ) profile
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_league_invite_alias(p_token text, p_league_id text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_invitee text;
  v_members int;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para invitar.');
  end if;

  if not exists (
    select 1 from public.pulse_league_members
    where league_id = p_league_id and user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Solo los miembros pueden invitar.');
  end if;

  select count(*)::int into v_members
  from public.pulse_league_members
  where league_id = p_league_id;

  if v_members >= 50 then
    return jsonb_build_object('ok', false, 'error', 'La liga ya está llena.');
  end if;

  select id into v_invitee
  from public.pulse_profiles
  where lower(alias) = lower(btrim(p_alias))
  limit 1;

  if v_invitee is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos ese alias.');
  end if;

  if exists (
    select 1 from public.pulse_league_members
    where league_id = p_league_id and user_id = v_invitee
  ) then
    return jsonb_build_object('ok', false, 'error', 'Esa persona ya está en la liga.');
  end if;

  insert into public.pulse_league_user_invites (id, league_id, inviter_id, invitee_id, status, expires_at)
  values (
    'linv_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
    p_league_id,
    v_user_id,
    v_invitee,
    'pending',
    now() + interval '7 days'
  )
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_league_my_invites(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', true, 'items', '[]'::jsonb);
  end if;

  update public.pulse_league_user_invites
  set status = 'expired'
  where invitee_id = v_user_id and status = 'pending' and expires_at <= now();

  return jsonb_build_object(
    'ok', true,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invite.id,
        'league', league.name,
        'from', coalesce(profile.alias, 'un rusher')
      ) order by invite.created_at desc)
      from public.pulse_league_user_invites invite
      join public.pulse_leagues league on league.id = invite.league_id
      left join public.pulse_profiles profile on profile.id = invite.inviter_id
      where invite.invitee_id = v_user_id
        and invite.status = 'pending'
        and invite.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_league_invite_respond(p_token text, p_invite_id text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  invite public.pulse_league_user_invites%rowtype;
  v_members int;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para responder.');
  end if;

  select * into invite
  from public.pulse_league_user_invites
  where id = p_invite_id and invitee_id = v_user_id;

  if invite is null then
    return jsonb_build_object('ok', false, 'error', 'Esa invitación ya no está disponible.');
  end if;

  if invite.status <> 'pending' or invite.expires_at <= now() then
    update public.pulse_league_user_invites set status = 'expired' where id = invite.id and status = 'pending';
    return jsonb_build_object('ok', false, 'error', 'Esa invitación ya venció.');
  end if;

  if not p_accept then
    update public.pulse_league_user_invites set status = 'rejected' where id = invite.id;
    return jsonb_build_object('ok', true);
  end if;

  if exists (
    select 1 from public.pulse_league_members
    where league_id = invite.league_id and user_id = v_user_id
  ) then
    update public.pulse_league_user_invites set status = 'accepted' where id = invite.id;
    return jsonb_build_object('ok', true, 'league', public.pulse_league_payload(invite.league_id, v_user_id));
  end if;

  select count(*)::int into v_members
  from public.pulse_league_members
  where league_id = invite.league_id;

  if v_members >= 50 then
    return jsonb_build_object('ok', false, 'error', 'La liga ya está llena.');
  end if;

  insert into public.pulse_league_members (league_id, user_id)
  values (invite.league_id, v_user_id);

  update public.pulse_league_user_invites set status = 'accepted' where id = invite.id;

  return jsonb_build_object('ok', true, 'league', public.pulse_league_payload(invite.league_id, v_user_id));
end;
$$;

create or replace function public.pulse_league_regen_code(p_token text, p_league_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_code text;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para gestionar la liga.');
  end if;

  if not exists (
    select 1 from public.pulse_leagues
    where id = p_league_id and owner_user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador puede regenerar el código.');
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  update public.pulse_leagues set code = v_code where id = p_league_id;
  update public.pulse_league_invites
  set code = v_code, used_count = 0
  where league_id = p_league_id;

  return jsonb_build_object('ok', true, 'league', public.pulse_league_payload(p_league_id, v_user_id));
end;
$$;

create or replace function public.pulse_league_remove_member(p_token text, p_league_id text, p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
begin
  v_user_id := public.pulse_user_id(p_token);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Entra para gestionar la liga.');
  end if;

  if not exists (
    select 1 from public.pulse_leagues
    where id = p_league_id and owner_user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador puede quitar miembros.');
  end if;

  if p_user_id = v_user_id then
    return jsonb_build_object('ok', false, 'error', 'El creador no puede salir de su liga.');
  end if;

  delete from public.pulse_league_members
  where league_id = p_league_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'league', public.pulse_league_payload(p_league_id, v_user_id));
end;
$$;

grant execute on function public.pulse_league_preview(text) to anon, authenticated, service_role;
grant execute on function public.pulse_league_join(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_league_invite_search(text, text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_league_invite_alias(text, text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_league_my_invites(text) to anon, authenticated, service_role;
grant execute on function public.pulse_league_invite_respond(text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.pulse_league_regen_code(text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_league_remove_member(text, text, text) to anon, authenticated, service_role;
grant execute on function public.pulse_league_payload(text, text) to anon, authenticated, service_role;
