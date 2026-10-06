-- One server-side score calculation is shared by personal totals and rankings.
create or replace function public.pulse_cycle_points(p_user_id text, p_cycle text default 'lifetime')
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cycle_start date;
  cycle_end date;
  total integer;
begin
  if p_cycle is null or p_cycle = 'lifetime' then
    cycle_start := null;
    cycle_end := null;
  else
    select starts_on, ends_on into cycle_start, cycle_end
    from public.pulse_cycles where id = p_cycle;
    if cycle_start is null then return 0; end if;
  end if;

  select coalesce(sum(tx.points), 0)::integer into total
  from public.pulse_transactions tx
  left join public.pulse_matches match on match.id = tx.metadata->>'matchId'
  where tx.user_id = p_user_id
    and not coalesce((tx.metadata->>'simulation')::boolean, false)
    and (
      tx.metadata->>'matchId' is null
      or (match.id is not null and not match.is_simulation and not match.is_demo)
    )
    and (
      cycle_start is null
      or coalesce(
        (match.starts_at at time zone 'America/Caracas')::date,
        nullif(tx.metadata->>'earnedOn', '')::date
      ) between cycle_start and cycle_end
    );
  return total;
end;
$$;

revoke all on function public.pulse_cycle_points(text, text) from public, anon, authenticated;

create or replace function public.pulse_my_cycle_points(p_token text, p_cycle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para consultar tus puntos.');
  end if;
  if p_cycle is not null and p_cycle <> 'lifetime'
     and not exists (select 1 from public.pulse_cycles where id = p_cycle) then
    return jsonb_build_object('ok', false, 'error', 'Esa ronda no existe.');
  end if;
  return jsonb_build_object('ok', true, 'points', public.pulse_cycle_points(uid, p_cycle));
end;
$$;

grant execute on function public.pulse_my_cycle_points(text, text) to anon, authenticated;

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
        public.pulse_cycle_points(profile.id, p_cycle) as points,
        public.pulse_cycle_points(profile.id, 'lifetime') as lifetime_points,
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
            and not pred_match.is_simulation and not pred_match.is_demo
            and (c_start is null or (pred_match.starts_at at time zone 'America/Caracas')::date between c_start and c_end)
        ) as last_prediction_at,
        row_number() over (order by
          public.pulse_cycle_points(profile.id, p_cycle) desc,
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
              and not pred_match.is_simulation and not pred_match.is_demo
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
              and not eligible_match.is_simulation and not eligible_match.is_demo
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

grant execute on function public.pulse_ranking(text, text, text) to anon, authenticated;
