-- La consola pedía los 40 partidos más nuevos (starts_at desc).
-- Con 78 juegos reales, esa página empieza el 23 oct y esconde la Ronda 1 y el 15 oct.
-- Los partidos no tienen columna de ronda: la ronda es la ventana de pulse_cycles y es solo un filtro.
-- Este reemplazo no toca puntos ni pronósticos.

create or replace function public.pulse_match_state(p_starts timestamptz, p_status text)
returns text
language sql
stable
as $$
  select case
    when p_status = 'cancelled' then 'anulado'
    when p_status = 'finished' then 'finalizado'
    when p_starts > now() then 'abierto'
    else 'en_juego'
  end;
$$;

revoke all on function public.pulse_match_state(timestamptz, text) from public;
grant execute on function public.pulse_match_state(timestamptz, text) to anon, authenticated, service_role;

create or replace function public.pulse_reject_early_final()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'finished'
     and new.starts_at > now()
     and (
       old.status is distinct from 'finished'
       or old.home_score is distinct from new.home_score
       or old.away_score is distinct from new.away_score
     )
  then
    raise exception 'Este juego aún no empieza. No se puede cargar el resultado todavía.';
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_matches_reject_early_final on public.pulse_matches;
create trigger pulse_matches_reject_early_final
  before update on public.pulse_matches
  for each row
  execute function public.pulse_reject_early_final();

create or replace function public.pulse_admin_match_board(
  p_admin_key text,
  p_status text,
  p_team text,
  p_from text,
  p_to text,
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
  team text := trim(coalesce(p_team, ''));
  bucket text := trim(coalesce(p_status, ''));
  from_day date := nullif(trim(coalesce(p_from, '')), '')::date;
  to_day date := nullif(trim(coalesce(p_to, '')), '')::date;
  total integer := 0;
begin
  actor := public.pulse_admin_actor(p_admin_key);
  select count(*)::integer into total
  from public.pulse_matches m
  where coalesce(m.is_simulation, false) = false
    and coalesce(m.is_demo, false) = false
    and (team = '' or m.home_team ilike '%' || team || '%' or m.away_team ilike '%' || team || '%')
    and (from_day is null or (m.starts_at at time zone 'America/Caracas')::date >= from_day)
    and (to_day is null or (m.starts_at at time zone 'America/Caracas')::date <= to_day)
    and (
      bucket = ''
      or (bucket = 'pending' and m.starts_at <= now() and m.status not in ('finished', 'cancelled') and m.home_score is null)
      or (bucket = 'upcoming' and m.starts_at > now() and m.status not in ('finished', 'cancelled'))
      or (bucket in ('settled', 'finished') and m.status = 'finished')
      or (bucket not in ('', 'pending', 'upcoming', 'settled', 'finished') and m.status = bucket)
    );

  return jsonb_build_object(
    'ok', true,
    'serverNow', now(),
    'total', total,
    'matches', coalesce((
      select jsonb_agg(row_to_json(item) order by item.sort_recent desc nulls last, item."startsAt" asc)
      from (
        select
          m.id,
          m.home_team as "homeTeam",
          m.away_team as "awayTeam",
          m.starts_at as "startsAt",
          m.status,
          m.home_score as "homeScore",
          m.away_score as "awayScore",
          public.pulse_match_state(m.starts_at, m.status) as phase,
          (
            select c.name
            from public.pulse_cycles c
            where (m.starts_at at time zone 'America/Caracas')::date between c.starts_on and c.ends_on
              and c.id <> 'demo_cierre'
            order by c.starts_on
            limit 1
          ) as "cycleName",
          (select count(*) from public.pulse_match_predictions p where p.match_id = m.id) as predictions,
          (select count(*) from public.pulse_match_predictions p where p.match_id = m.id and p.processed_at is not null) as processed,
          coalesce((
            select sum(tx.points)
            from public.pulse_transactions tx
            join public.pulse_match_predictions p on p.id = tx.source_id
            where tx.source_type = 'prediction' and p.match_id = m.id
          ), 0) as points,
          case when bucket in ('settled', 'finished') then m.starts_at else null end as sort_recent
        from public.pulse_matches m
        where coalesce(m.is_simulation, false) = false
          and coalesce(m.is_demo, false) = false
          and (team = '' or m.home_team ilike '%' || team || '%' or m.away_team ilike '%' || team || '%')
          and (from_day is null or (m.starts_at at time zone 'America/Caracas')::date >= from_day)
          and (to_day is null or (m.starts_at at time zone 'America/Caracas')::date <= to_day)
          and (
            bucket = ''
            or (bucket = 'pending' and m.starts_at <= now() and m.status not in ('finished', 'cancelled') and m.home_score is null)
            or (bucket = 'upcoming' and m.starts_at > now() and m.status not in ('finished', 'cancelled'))
            or (bucket in ('settled', 'finished') and m.status = 'finished')
            or (bucket not in ('', 'pending', 'upcoming', 'settled', 'finished') and m.status = bucket)
          )
        order by
          case when bucket in ('settled', 'finished') then m.starts_at end desc nulls last,
          m.starts_at asc
        limit lim offset off
      ) item
    ), '[]'::jsonb)
  );
end;
$$;
