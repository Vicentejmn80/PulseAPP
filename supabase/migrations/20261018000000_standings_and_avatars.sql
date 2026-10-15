-- Avatares de equipo y tabla "Así van".
-- La pantalla calcula con la misma regla en src/lib/lvbpStandings.ts a partir de los finales.
-- Esta función deja la misma cuenta en la base, sin tabla editable.
-- Casa y ruta salen de home_team / away_team, que ya existen. No hace falta una columna nueva.

update public.pulse_profiles
set avatar_id = null
where avatar_id is not null
  and avatar_id not in (
    'leones', 'navegantes', 'tiburones', 'tigres',
    'cardenales', 'aguilas', 'caribes', 'bravos'
  );

alter table public.pulse_profiles
  drop constraint if exists pulse_profiles_avatar_id_check;

alter table public.pulse_profiles
  add constraint pulse_profiles_avatar_id_check
  check (
    avatar_id is null
    or avatar_id in (
      'leones', 'navegantes', 'tiburones', 'tigres',
      'cardenales', 'aguilas', 'caribes', 'bravos'
    )
  );

create or replace function public.pulse_set_avatar(p_token text, p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  if p_avatar_id not in (
    'leones', 'navegantes', 'tiburones', 'tigres',
    'cardenales', 'aguilas', 'caribes', 'bravos'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese avatar no está disponible.');
  end if;
  update public.pulse_profiles
  set avatar_id = p_avatar_id
  where id = uid;
  return jsonb_build_object('ok', true, 'avatarId', p_avatar_id);
end;
$$;

create or replace function public.pulse_lvbp_club(p_name text)
returns text
language sql
immutable
as $$
  select case
    when translated like '%guaira%' or translated like '%tiburon%' then 'tiburones'
    when translated like '%zulia%' or translated like '%aguila%' then 'aguilas'
    when translated like '%aragua%' or translated like '%tigre%' then 'tigres'
    when translated like '%lara%' or translated like '%cardenal%' then 'cardenales'
    when translated like '%margarita%' or translated like '%bravo%' then 'bravos'
    when translated like '%anzoategui%' or translated like '%caribe%' then 'caribes'
    when translated like '%caracas%' or translated like '%leon%' then 'leones'
    when translated like '%magallanes%' or translated like '%navegante%' then 'navegantes'
    else null
  end
  from (
    select lower(translate(coalesce(p_name, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) as translated
  ) named;
$$;

create or replace function public.pulse_lvbp_standings()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with clubs(id, short_name, ord) as (
    values
      ('aguilas', 'Águilas', 1),
      ('bravos', 'Bravos', 2),
      ('caribes', 'Caribes', 3),
      ('cardenales', 'Cardenales', 4),
      ('leones', 'Leones', 5),
      ('navegantes', 'Navegantes', 6),
      ('tiburones', 'Tiburones', 7),
      ('tigres', 'Tigres', 8)
  ),
  finals as (
    select
      public.pulse_lvbp_club(m.home_team) as home_id,
      public.pulse_lvbp_club(m.away_team) as away_id,
      m.home_score,
      m.away_score,
      m.starts_at
    from public.pulse_matches m
    where m.status = 'finished'
      and coalesce(m.is_demo, false) = false
      and coalesce(m.is_simulation, false) = false
      and m.home_score is not null
      and m.away_score is not null
      and m.home_score <> m.away_score
      and public.pulse_lvbp_club(m.home_team) is not null
      and public.pulse_lvbp_club(m.away_team) is not null
      and public.pulse_lvbp_club(m.home_team) <> public.pulse_lvbp_club(m.away_team)
  ),
  sides as (
    select home_id as id, true as home, home_score as scored, away_score as allowed, starts_at,
      home_score > away_score as won
    from finals
    union all
    select away_id, false, away_score, home_score, starts_at, away_score > home_score
    from finals
  ),
  ordered as (
    select id, home, won, scored, allowed, starts_at,
      row_number() over (partition by id order by starts_at desc, home desc) as recent_rank
    from sides
  ),
  totals as (
    select
      id,
      count(*)::int as played,
      count(*) filter (where won)::int as wins,
      count(*) filter (where not won)::int as losses,
      coalesce(sum(scored - allowed), 0)::int as run_diff,
      count(*) filter (where home and won)::int as home_wins,
      count(*) filter (where home and not won)::int as home_losses,
      count(*) filter (where not home and won)::int as away_wins,
      count(*) filter (where not home and not won)::int as away_losses,
      count(*) filter (where recent_rank <= 10 and won)::int as last_wins,
      count(*) filter (where recent_rank <= 10 and not won)::int as last_losses
    from ordered
    group by id
  )
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(row_to_json(item)), '[]'::jsonb))
  from (
    select
      c.id,
      c.short_name as team,
      coalesce(t.played, 0) as played,
      coalesce(t.wins, 0) as wins,
      coalesce(t.losses, 0) as losses,
      case when coalesce(t.played, 0) = 0 then null else round(t.wins::numeric / t.played, 3) end as "winPct",
      coalesce(t.run_diff, 0) as "runDiff",
      case when coalesce(t.played, 0) = 0 then '-' else t.last_wins::text || '-' || t.last_losses::text end as last10,
      coalesce(t.home_wins, 0)::text || '-' || coalesce(t.home_losses, 0)::text as home,
      coalesce(t.away_wins, 0)::text || '-' || coalesce(t.away_losses, 0)::text as away
    from clubs c
    left join totals t on t.id = c.id
    order by
      case when coalesce(t.played, 0) = 0 then 1 else 0 end,
      case when coalesce(t.played, 0) = 0 then 0 else t.wins::numeric / t.played end desc,
      coalesce(t.wins, 0) desc,
      coalesce(t.run_diff, 0) desc,
      c.short_name
  ) item;
$$;

create or replace function public.pulse_admin_ledger(
  p_admin_key text,
  p_type text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  off integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
  kind text := trim(coalesce(p_type, ''));
begin
  actor := public.pulse_admin_actor(p_admin_key);
  return jsonb_build_object(
    'ok', true,
    'movements', coalesce((
      select jsonb_agg(row_to_json(item))
      from (
        select
          t.id,
          t.user_id as "userId",
          pr.handle,
          pr.avatar_id as "avatarId",
          t.source_type as type,
          t.points,
          t.created_at as at,
          t.source_id as "sourceId",
          t.metadata->>'matchId' as "matchId",
          t.metadata->>'venueId' as "venueId",
          t.metadata->>'campaignId' as "campaignId",
          t.metadata->>'reason' as reason,
          t.metadata->>'adminId' as "adminId"
        from public.pulse_transactions t
        join public.pulse_profiles pr on pr.id = t.user_id
        where kind = '' or t.source_type = kind
        order by t.created_at desc
        limit lim offset off
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pulse_lvbp_club(text) from public;
grant execute on function public.pulse_lvbp_club(text) to anon, authenticated, service_role;
revoke all on function public.pulse_lvbp_standings() from public;
grant execute on function public.pulse_lvbp_standings() to anon, authenticated, service_role;
revoke all on function public.pulse_admin_ledger(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.pulse_admin_ledger(text, text, integer, integer) to service_role;
grant execute on function public.pulse_set_avatar(text, text) to anon, authenticated;
