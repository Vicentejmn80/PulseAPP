-- Fase 1. Se aplica sola sobre la base actual, sin la migración de PIN.
-- No quita EXECUTE de alta, ingreso, carga, alias ni del panel admin:
-- el cliente desplegado los llama con la clave anónima.

do $phase1_mutators$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'pulse_award_plenos',
        'pulse_apply_match_event',
        'pulse_assign_game_challenges',
        'pulse_bingo_mark',
        'pulse_close_due_flash',
        'pulse_close_due_live',
        'pulse_credit',
        'pulse_evaluate_match_challenges',
        'pulse_live_apply',
        'pulse_lock_due_matches',
        'pulse_match_side_effects',
        'pulse_open_inning_question',
        'pulse_resolve_duels',
        'pulse_resolve_inning_question',
        'pulse_score_match_now',
        'pulse_sim_clear',
        'pulse_sim_finish',
        'pulse_sim_script',
        'pulse_sim_tick',
        'pulse_void_bingo'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
end
$phase1_mutators$;

do $phase1_rls$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all on table public.%I from public, anon, authenticated', r.relname);
  end loop;
end
$phase1_rls$;

do $phase1_otp_provider$
begin
  if to_regprocedure('public.pulse_otp_provider(text)') is not null then
    revoke all on function public.pulse_otp_provider(text) from public, anon, authenticated;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      grant execute on function public.pulse_otp_provider(text) to service_role;
    end if;
  end if;
end
$phase1_otp_provider$;

-- ALTER DEFAULT PRIVILEGES no quita el EXECUTE de fábrica que Postgres da a
-- PUBLIC en funciones nuevas. El trigger que sí lo quita está en
-- supabase/optional/pulse_harden_new_public.sql y no forma parte de esta
-- migración: si ese archivo falla, la Fase 1 ya quedó aplicada.
do $phase1_defaults$
declare
  r text;
begin
  for r in
    select rolname
    from pg_roles
    where rolname in ('postgres', 'supabase_admin')
      and (rolname = current_user or pg_has_role(current_user, oid, 'MEMBER'))
  loop
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format(
        'alter default privileges for role %I in schema public grant execute on functions to service_role',
        r
      );
    end if;
    execute format(
      'alter default privileges for role %I in schema public revoke execute on functions from public, anon, authenticated',
      r
    );
    execute format(
      'alter default privileges for role %I in schema public revoke all on tables from public, anon, authenticated',
      r
    );
  end loop;
end
$phase1_defaults$;
