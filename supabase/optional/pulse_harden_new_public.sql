-- Opcional. No forma parte de la Fase 1.
-- En Supabase, la documentación dice que postgres puede crear event triggers
-- gracias a supautils, sin ser superusuario:
-- https://supabase.com/docs/guides/database/postgres/event-triggers
-- En un Postgres normal, CREATE EVENT TRIGGER exige superusuario. Si este
-- archivo falla, la Fase 1 ya está aplicada y no hay que revertirla.

create or replace function public.pulse_harden_new_public()
returns event_trigger
language plpgsql
security definer
set search_path to public
as $harden$
declare
  obj record;
begin
  for obj in
    select object_type, object_identity, schema_name
    from pg_event_trigger_ddl_commands()
  loop
    if obj.schema_name is distinct from 'public' then
      continue;
    end if;
    if obj.object_type = 'function' then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        obj.object_identity
      );
    elsif obj.object_type = 'table' then
      execute format('alter table %s enable row level security', obj.object_identity);
      execute format(
        'revoke all on table %s from public, anon, authenticated',
        obj.object_identity
      );
    end if;
  end loop;
end;
$harden$;

revoke all on function public.pulse_harden_new_public() from public, anon, authenticated;

drop event trigger if exists pulse_harden_new_public_trg;
create event trigger pulse_harden_new_public_trg
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE TABLE')
  execute function public.pulse_harden_new_public();
