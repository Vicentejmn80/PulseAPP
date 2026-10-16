-- Reseteo de personas y datos de juego de Rusher.
-- Proyecto: https://ovgwqeoslaitsmhdkxbl.supabase.co
-- Este archivo NO está aplicado. No lo corras hasta responder CONFIRMO.
-- Conserva a Chentesa por id, no por alias. Un alias parecido (Chenteeee) es otra cuenta y se borra.

-- Paso 1, respaldo. Se puede correr solo. Si el esquema ya existe, no lo pisa.
create schema if not exists backup_pre_reset_20261016;

do $$
declare
  item text;
begin
  foreach item in array array[
    'pulse_profiles','pulse_sessions','pulse_match_predictions','pulse_transactions',
    'pulse_notifications','pulse_score_ledger','pulse_admin_audit','pulse_admins',
    'pulse_matches','pulse_venues','pulse_qr_scans','pulse_campaign_rewards'
  ]
  loop
    if to_regclass('backup_pre_reset_20261016.' || item) is null then
      execute format('create table backup_pre_reset_20261016.%I as select * from public.%I', item, item);
    end if;
  end loop;
end $$;

-- Paso 2, borrado. Transacción aparte del respaldo.
begin;

do $$
declare
  keeper constant text := 'user_4686586358e6496daf18d3cb7d3c13ea';
begin
  if to_regclass('backup_pre_reset_20261016.pulse_profiles') is null then
    raise exception 'Falta el respaldo backup_pre_reset_20261016. No se borra nada.';
  end if;
  if (select count(*) from public.pulse_profiles where id = keeper and lower(alias) = 'chentesa' and handle = '@chentesa') <> 1 then
    raise exception 'Chentesa no coincide con el id guardado. No se borra nada.';
  end if;
  if (select role from public.pulse_admins where user_id = keeper) is distinct from 'super' then
    raise exception 'Esa cuenta no es super admin. No se borra nada.';
  end if;

  -- Hijos de partidos y de usuarios. Las claves con ON DELETE CASCADE también caen al borrar el perfil.
  delete from public.pulse_score_ledger;
  delete from public.pulse_notifications;
  delete from public.pulse_match_predictions;
  delete from public.pulse_transactions;
  delete from public.pulse_sessions where user_id <> keeper;
  delete from public.pulse_admin_audit;
  delete from public.pulse_qr_scans;
  delete from public.pulse_campaign_rewards;
  delete from public.pulse_prize_winners;
  delete from public.pulse_prizes;

  update public.pulse_analytics_events set user_id = null where user_id is not null and user_id <> keeper;
  update public.pulse_trivia_questions set created_by = null where created_by is not null and created_by <> keeper;

  delete from public.pulse_profiles where id <> keeper;

  delete from public.pulse_match_predictions where user_id = keeper;
  delete from public.pulse_transactions where user_id = keeper;
  delete from public.pulse_notifications where user_id = keeper;
  update public.pulse_profiles
  set onboarding_visto_at = null
  where id = keeper;

  update public.pulse_matches
  set status = 'scheduled',
      home_score = null,
      away_score = null
  where coalesce(is_demo, false) = false
    and coalesce(is_simulation, false) = false;
end $$;

commit;
