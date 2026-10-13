-- RUSHER — Roles de admin y auditoría (PASO 1, previo al hardening).
--
-- Contenido:
--  1. Tabla pulse_admins (user_id PK, granted_at, granted_by).
--  2. Tabla pulse_admin_audit (id, user_id, action, target, ok, details).
--  3. Función pulse_admin_check(p_token) → user_id o excepción.
--  4. pulse_require_admin dual: acepta token de sesión (rama nueva) o clave
--     compartida de 32+ chars (fallback legacy). NIEGA LANZANDO EXCEPCIÓN.
--  5. Seed del superadmin por teléfono (requiere PASO 0 previo) + NOTICE si no
--     inserta fila.
--
-- Decisiones de seguridad (leer antes de modificar):
--  a) Denegar con EXCEPCIÓN y no con `return false`: los ~40 RPCs admin usan
--     dos estilos (`perform pulse_require_admin(...)` y
--     `if not pulse_require_admin(...)`). Con semántica boolean+false, los
--     `perform` descartan el resultado y el chequeo sería un no-op silencioso.
--     Con excepción, ambos estilos quedan protegidos.
--  b) Esta migración NO revoca nada ni toca grants existentes (CREATE OR
--     REPLACE los preserva). El hardening posterior se encarga de eso.
--  c) RLS habilitado sin policies en las tablas nuevas: solo service_role
--     (bypass RLS) y el owner acceden. Mismo patrón que pulse_pin_attempts.
--  d) p_admin_key/p_token del cliente nunca se guardan en auditoría.

-- ── 1. Tabla de administradores ─────────────────────────────────────────────
create table if not exists public.pulse_admins (
  user_id text primary key references public.pulse_profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by text not null default 'bootstrap'
);

alter table public.pulse_admins enable row level security;
revoke all on table public.pulse_admins from public, anon, authenticated;

-- ── 2. Tabla de auditoría de acciones admin ─────────────────────────────────
create table if not exists public.pulse_admin_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id text not null references public.pulse_profiles (id) on delete cascade,
  action text not null,
  target text,
  ok boolean not null default true,
  details jsonb not null default '{}'::jsonb
);

alter table public.pulse_admin_audit enable row level security;
revoke all on table public.pulse_admin_audit from public, anon, authenticated;

-- ── 3. Verificación de admin por sesión ──────────────────────────────────────
-- Solo la llama el backend (service_role). Nunca exponer a anon/authenticated.
create or replace function public.pulse_admin_check(p_token text)
returns text
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_uid text;
begin
  v_uid := public.pulse_user_id(p_token);
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;
  if not exists (select 1 from public.pulse_admins where user_id = v_uid) then
    raise exception 'Sin permiso.';
  end if;
  return v_uid;
end;
$$;

revoke all on function public.pulse_admin_check(text) from public, anon, authenticated;
grant execute on function public.pulse_admin_check(text) to service_role;

-- ── 4. pulse_require_admin dual: token O clave ──────────────────────────────
-- returns boolean para seguir compilando en ambos estilos de llamada
-- (`perform ...` y `if not ...`), pero la negación SIEMPRE es excepción.
create or replace function public.pulse_require_admin(p_admin_key text)
returns boolean
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_got text := trim(coalesce(p_admin_key, ''));
  v_key text;
  v_a bytea;
  v_b bytea;
  v_diff int := 0;
  v_i int;
begin
  -- Rama nueva: token de sesión (prefijo sess_, formato de pulse_sessions).
  if v_got like 'sess\_%' escape '\' then
    perform public.pulse_admin_check(v_got);
    return true;
  end if;

  -- Rama legacy: clave compartida, comparación en tiempo constante.
  select admin_key into v_key from public.pulse_admin_keys order by id limit 1;
  if v_key is null or length(v_got) < 32 or length(v_key) < 32 then
    raise exception 'Sin permiso.';
  end if;
  v_a := extensions.digest(v_got, 'sha256');
  v_b := extensions.digest(v_key, 'sha256');
  for v_i in 0..31 loop
    v_diff := v_diff + (get_byte(v_a, v_i) # get_byte(v_b, v_i));
  end loop;
  if v_diff <> 0 then
    raise exception 'Sin permiso.';
  end if;
  return true;
end;
$$;

-- ── 5. Seed del superadmin (requiere PASO 0: cuenta creada) ─────────────────
insert into public.pulse_admins (user_id, granted_by)
select id, 'bootstrap_step0'
from public.pulse_profiles
where phone = '+584242349676'
on conflict (user_id) do nothing;

do $$
begin
  if not exists (select 1 from public.pulse_admins pa
                 join public.pulse_profiles pr on pr.id = pa.user_id
                 where pr.phone = '+584242349676') then
    raise notice 'SEED SUPERADMIN: no se insertó fila. Ejecuta el PASO 0 (crear la cuenta +584242349676) y re-aplica esta migración.';
  else
    raise notice 'SEED SUPERADMIN: fila presente para +584242349676.';
  end if;
end;
$$;

-- ── Verificación post-aplicación (lectura, pegar en SQL editor) ─────────────
-- select * from public.pulse_admins;
-- select public.pulse_require_admin('clave-corta');            -- debe lanzar excepción
-- select public.pulse_require_admin('sess_token-invalido-xyz'); -- debe lanzar excepción
-- Con token real de admin: select public.pulse_admin_check('<token>'); -- devuelve user_id
