-- Billetera de premios: el cierre de ronda sigue creando pulse_prizes.
-- seen_at solo evita repetir el aviso. No crea otro sistema de premios.

alter table public.pulse_prizes
  add column if not exists seen_at timestamptz;

create or replace function public.pulse_my_prizes(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  eligible boolean;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('eligible', false, 'prizes', '[]'::jsonb);
  end if;

  update public.pulse_prizes
  set status = 'expired'
  where winner_user_id = uid
    and status = 'assigned'
    and expires_at <= now();

  select prize_eligible into eligible from public.pulse_profiles where id = uid;
  return jsonb_build_object(
    'eligible', coalesce(eligible, false),
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prize.id,
        'cycleId', prize.cycle_id,
        'cycleName', cycle.name,
        'rank', prize.rank_slot,
        'code', prize.redemption_code,
        'status', prize.status,
        'expiresAt', prize.expires_at,
        'seenAt', prize.seen_at,
        'daysLeft', greatest(0, ceil(extract(epoch from (prize.expires_at - now())) / 86400.0))::int,
        'prizeName', 'Tobo de cerveza'
      ) order by prize.expires_at desc)
      from public.pulse_prizes prize
      join public.pulse_cycles cycle on cycle.id = prize.cycle_id
      where prize.winner_user_id = uid
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pulse_prize_mark_seen(p_token text, p_prize_id text)
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
    return jsonb_build_object('ok', false, 'error', 'Entra para ver tu premio.');
  end if;
  update public.pulse_prizes
  set seen_at = now()
  where id = p_prize_id
    and winner_user_id = uid
    and seen_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.pulse_my_prizes(text) to anon, authenticated;
grant execute on function public.pulse_prize_mark_seen(text, text) to anon, authenticated;
