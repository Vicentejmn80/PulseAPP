-- Reversible test scenario. October rows use ids like lvbp_ and are not touched.
-- Test matches use the id prefix test_.

alter table public.pulse_venues
  add column if not exists instagram text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists round_prize text not null default '',
  add column if not exists games_airing jsonb not null default '[]'::jsonb;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.pulse_live_questions'::regclass, 'public.pulse_flash_questions'::regclass)
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table %s drop constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
end $$;

alter table public.pulse_live_questions
  add constraint pulse_live_questions_status_check
  check (status in ('draft', 'open', 'closed', 'resolved', 'void'));

alter table public.pulse_flash_questions
  add constraint pulse_flash_questions_status_check
  check (status in ('draft', 'open', 'closed', 'resolved', 'void'));

create or replace function public.pulse_admin_venues(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'zone', zone,
      'address', address,
      'instagram', instagram,
      'whatsapp', whatsapp,
      'roundPrize', round_prize,
      'qrToken', qr_token,
      'broadcasts', broadcasts,
      'isFounder', is_founder
    ) order by name)
    from public.pulse_venues
    where active
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_venues_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', venue.id,
    'name', venue.name,
    'zone', venue.zone,
    'address', venue.address,
    'contact', venue.contact,
    'instagram', venue.instagram,
    'whatsapp', venue.whatsapp,
    'roundPrize', venue.round_prize,
    'broadcasts', venue.broadcasts,
    'isFounder', venue.is_founder,
    'gamesAiring', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', match.id,
        'awayTeam', match.away_team,
        'homeTeam', match.home_team,
        'startsAt', match.starts_at
      ) order by match.starts_at)
      from public.pulse_matches match
      where match.id in (
        select jsonb_array_elements_text(venue.games_airing)
      )
    ), '[]'::jsonb)
  ) order by venue.is_founder desc, venue.name), '[]'::jsonb)
  from public.pulse_venues venue
  where venue.active;
$$;

create or replace function public.pulse_admin_save_venue_details(
  p_admin_key text,
  p_venue_id text,
  p_zone text,
  p_address text,
  p_instagram text,
  p_whatsapp text,
  p_prize text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_venues
  set zone = trim(coalesce(p_zone, '')),
      address = trim(coalesce(p_address, '')),
      instagram = trim(coalesce(p_instagram, '')),
      whatsapp = trim(coalesce(p_whatsapp, '')),
      round_prize = trim(coalesce(p_prize, ''))
  where id = p_venue_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No encontré esa tasca.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_live_activate(p_admin_key text, p_question text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  update public.pulse_live_questions
  set status = 'open'
  where id = p_question and status = 'draft';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no está en borrador.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_flash_activate(p_admin_key text, p_question text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  minutes integer := public.pulse_cfg_int('FLASH_MINUTES');
begin
  perform public.pulse_require_admin(p_admin_key);
  if minutes is null or minutes < 1 then
    minutes := 5;
  end if;
  update public.pulse_flash_questions
  set status = 'open',
      opens_at = now(),
      closes_at = now() + make_interval(mins => minutes)
  where id = p_question and status = 'draft';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa pregunta no está en borrador.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pulse_admin_flash_list(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pulse_require_admin(p_admin_key);
  perform public.pulse_close_due_flash();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'options', q.options,
      'status', q.status,
      'closesAt', q.closes_at,
      'venueId', q.venue_id,
      'correctOption', case when q.status = 'draft' then null else q.correct_option end,
      'total', (select count(*) from public.pulse_flash_answers a where a.question_id = q.id),
      'byVenue', coalesce((
        select jsonb_agg(jsonb_build_object('venue', v.name, 'count', grouped.n))
        from (
          select venue_id, count(*) as n
          from public.pulse_flash_answers
          where question_id = q.id
          group by venue_id
        ) grouped
        left join public.pulse_venues v on v.id = grouped.venue_id
      ), '[]'::jsonb)
    ) order by q.created_at desc)
    from public.pulse_flash_questions q
    where q.status = 'draft' or q.created_at > now() - interval '2 days'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.pulse_seed_test_scenario(p_admin_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.pulse_caracas_today();
  starts_a timestamptz;
  starts_b timestamptz;
  token text;
begin
  perform public.pulse_require_admin(p_admin_key);
  starts_a := (today::timestamp + time '15:05') at time zone 'America/Caracas';
  starts_b := (today::timestamp + time '16:00') at time zone 'America/Caracas';

  insert into public.pulse_matches (id, home_team, away_team, starts_at, status, home_score, away_score)
  values
    ('test_prueba_a', 'Navegantes del Magallanes', 'Leones del Caracas', starts_a, 'scheduled', null, null),
    ('test_prueba_b', 'Cardenales de Lara', 'Tigres de Aragua', starts_b, 'scheduled', null, null)
  on conflict (id) do update
  set home_team = excluded.home_team,
      away_team = excluded.away_team,
      starts_at = excluded.starts_at
  where public.pulse_matches.status = 'scheduled';

  insert into public.pulse_venues (
    id, name, zone, address, contact, instagram, whatsapp, round_prize, is_founder, active, qr_token, broadcasts, games_airing
  ) values (
    'venue_la_europea',
    'La Europea',
    'Por confirmar',
    'Por confirmar',
    '',
    'Por confirmar',
    'Por confirmar',
    'Tobo de 10 cervezas',
    true,
    true,
    'qlaeuropea00000001',
    '',
    '["test_prueba_a","test_prueba_b"]'::jsonb
  )
  on conflict (id) do update
  set name = excluded.name,
      is_founder = true,
      active = true,
      games_airing = excluded.games_airing,
      zone = case when public.pulse_venues.zone in ('', 'Por confirmar') then excluded.zone else public.pulse_venues.zone end,
      address = case when public.pulse_venues.address in ('', 'Por confirmar') then excluded.address else public.pulse_venues.address end,
      instagram = case when public.pulse_venues.instagram in ('', 'Por confirmar') then excluded.instagram else public.pulse_venues.instagram end,
      whatsapp = case when public.pulse_venues.whatsapp in ('', 'Por confirmar') then excluded.whatsapp else public.pulse_venues.whatsapp end,
      round_prize = case when public.pulse_venues.round_prize in ('', 'Tobo de 10 cervezas') then excluded.round_prize else public.pulse_venues.round_prize end;

  select qr_token into token from public.pulse_venues where id = 'venue_la_europea';

  insert into public.pulse_live_questions (id, match_id, prompt, options, status, closes_at)
  values (
    'test_live_prueba_a',
    'test_prueba_a',
    '¿Anotan carreras en el 1er inning?',
    '[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]'::jsonb,
    'draft',
    null
  )
  on conflict (id) do nothing;

  insert into public.pulse_flash_questions (id, venue_id, prompt, options, status, correct_option, opens_at, closes_at)
  values (
    'test_flash_europea',
    'venue_la_europea',
    '¿Cuántos outs tiene cada equipo por inning?',
    '[{"id":"opt1","label":"2"},{"id":"opt2","label":"3"},{"id":"opt3","label":"4"},{"id":"opt4","label":"5"}]'::jsonb,
    'draft',
    'opt2',
    now(),
    now() + interval '100 years'
  )
  on conflict (id) do nothing;

  update public.pulse_bingo_events set active = true
  where id in (
    'jonron', 'ponche', 'doble_play', 'base_robada', 'error', 'bases_llenas',
    'triple', 'sacrificio', 'carrera_1er', 'extra_innings', 'cerrado_1', 'blanqueada'
  );

  return jsonb_build_object(
    'ok', true,
    'matches', jsonb_build_array('test_prueba_a', 'test_prueba_b'),
    'venueId', 'venue_la_europea',
    'qrToken', token,
    'liveId', 'test_live_prueba_a',
    'flashId', 'test_flash_europea',
    'startsA', starts_a,
    'startsB', starts_b
  );
end;
$$;

create or replace function public.pulse_cleanup_test(p_admin_key text, p_include_venue boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.pulse_caracas_today();
  removed_tx integer;
begin
  perform public.pulse_require_admin(p_admin_key);

  delete from public.pulse_transactions tx
  where coalesce(tx.metadata->>'matchId', '') like 'test_%'
     or tx.source_id like 'bingo:test_%'
     or tx.source_id like 'pleno:%:' || today::text
     or tx.source_id in (
       select answer.id
       from public.pulse_live_answers answer
       join public.pulse_live_questions question on question.id = answer.question_id
       where question.match_id like 'test_%' or question.id like 'test_%'
     )
     or tx.source_id in (
       select answer.id
       from public.pulse_flash_answers answer
       join public.pulse_flash_questions question on question.id = answer.question_id
       where question.id like 'test_%' or question.venue_id = 'venue_la_europea'
     )
     or (tx.source_type = 'qr_scan' and tx.metadata->>'venueId' = 'venue_la_europea')
     or (tx.source_type = 'streak' and nullif(tx.metadata->>'earnedOn', '')::date = today);
  get diagnostics removed_tx = row_count;

  delete from public.pulse_activity_events
  where coalesce(metadata->>'matchId', '') like 'test_%'
     or venue_id = 'venue_la_europea'
     or dedupe_key like 'bingo_resolved:test_%'
     or dedupe_key like '%test_live_prueba_a%'
     or dedupe_key like '%test_flash_europea%';

  delete from public.pulse_play_days where played_on = today;
  delete from public.pulse_qr_scans where venue_id = 'venue_la_europea';
  delete from public.pulse_flash_questions
  where id like 'test_%' or venue_id = 'venue_la_europea';
  delete from public.pulse_matches where id like 'test_%';

  if coalesce(p_include_venue, false) then
    delete from public.pulse_venues where id = 'venue_la_europea';
  end if;

  return jsonb_build_object('ok', true, 'removedTransactions', removed_tx, 'venueKept', not coalesce(p_include_venue, false));
end;
$$;

grant execute on function public.pulse_admin_save_venue_details(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.pulse_admin_live_activate(text, text) to anon, authenticated;
grant execute on function public.pulse_admin_flash_activate(text, text) to anon, authenticated;
grant execute on function public.pulse_seed_test_scenario(text) to anon, authenticated;
grant execute on function public.pulse_cleanup_test(text, boolean) to anon, authenticated;
