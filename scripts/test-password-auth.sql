-- RUSHER — Tests SQL del auth con contraseña (Bloque 1).
-- Correr en staging como rol con permisos (SQL editor). NO correr en prod.
-- Es re-ejecutable: limpia sus usuarios de prueba al inicio y al final.
-- Cubre los 5 casos obligatorios: PIN ok → 200/ok, PIN mal → AUTH_INVALID,
-- contraseña ok → ok, contraseña mal → AUTH_INVALID, contraseña en cuenta
-- sin contraseña → AUTH_INVALID (nunca PASSWORD_NOT_SET).

-- Limpieza previa (idempotencia del script).
delete from public.pulse_profiles where phone in ('+584249991001', '+584249991002', '+584249991003');

do $$
declare
  r jsonb;
  pin_only_id text;
  both_id text;
begin
  -- 1. Registro solo PIN → auth_method='pin'.
  r := public.pulse_account_register('+584249991001', 'Usuario Prueba Uno', 'testpwd_uno', '482916');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL registro PIN: %', r;
  end if;
  select id into pin_only_id from public.pulse_profiles where phone = '+584249991001';
  if (select auth_method from public.pulse_profiles where id = pin_only_id) <> 'pin' then
    raise exception 'FAIL auth_method esperado pin';
  end if;
  raise notice 'OK registro solo PIN (auth_method=pin)';

  -- 2. Registro PIN + contraseña → auth_method='both', password_set_at lleno.
  r := public.pulse_account_register_password('+584249991002', 'Usuario Prueba Dos', 'testpwd_dos', '482916', 'Clave123!');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL registro both: %', r;
  end if;
  select id into both_id from public.pulse_profiles where phone = '+584249991002';
  if (select auth_method from public.pulse_profiles where id = both_id) <> 'both' then
    raise exception 'FAIL auth_method esperado both';
  end if;
  if (select password_set_at from public.pulse_profiles where id = both_id) is null then
    raise exception 'FAIL password_set_at nulo';
  end if;
  if (select password_hash from public.pulse_profiles where id = both_id) = (select pin_hash from public.pulse_profiles where id = both_id) then
    raise exception 'FAIL pin_hash y password_hash idénticos';
  end if;
  raise notice 'OK registro PIN+contraseña (auth_method=both)';

  -- 3. Teléfono duplicado → REGISTER_REJECTED (genérico, sin enumerar).
  r := public.pulse_account_register_password('+584249991001', 'Otro Nombre', 'testpwd_tres', '482916', 'Clave123!');
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'REGISTER_REJECTED' then
    raise exception 'FAIL duplicado debió dar REGISTER_REJECTED: %', r;
  end if;
  raise notice 'OK duplicado rechazado con código genérico';

  -- 4. Login PIN correcto → ok.
  r := public.pulse_account_login('+584249991001', '482916');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL login PIN correcto: %', r;
  end if;
  raise notice 'OK login PIN correcto';

  -- 5. Login PIN incorrecto → AUTH_INVALID (mismo código y texto únicos).
  r := public.pulse_account_login('+584249991001', '000001');
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'AUTH_INVALID' then
    raise exception 'FAIL PIN mal debió dar AUTH_INVALID: %', r;
  end if;
  raise notice 'OK login PIN incorrecto → AUTH_INVALID';

  -- 6. Login contraseña correcta → ok.
  r := public.pulse_account_login_password('+584249991002', 'Clave123!', 'password');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL login contraseña correcta: %', r;
  end if;
  raise notice 'OK login contraseña correcta';

  -- 7. Auto-detección: 6 dígitos van por PIN, resto por contraseña.
  r := public.pulse_account_login_password('+584249991002', '482916', 'auto');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL auto→PIN: %', r;
  end if;
  r := public.pulse_account_login_password('+584249991002', 'Clave123!', 'auto');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL auto→password: %', r;
  end if;
  raise notice 'OK auto-detección en ambas ramas';

  -- 8. Login contraseña incorrecta → AUTH_INVALID.
  r := public.pulse_account_login_password('+584249991002', 'Otra123!', 'password');
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'AUTH_INVALID' then
    raise exception 'FAIL contraseña mal debió dar AUTH_INVALID: %', r;
  end if;
  raise notice 'OK login contraseña incorrecta → AUTH_INVALID';

  -- 9. Contraseña en cuenta SIN contraseña → AUTH_INVALID (nunca PASSWORD_NOT_SET).
  r := public.pulse_account_login_password('+584249991001', 'Clave123!', 'password');
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'AUTH_INVALID' then
    raise exception 'FAIL cuenta-sin-contraseña debió dar AUTH_INVALID: %', r;
  end if;
  if (r->>'code') = 'PASSWORD_NOT_SET' then
    raise exception 'FAIL se filtró PASSWORD_NOT_SET';
  end if;
  raise notice 'OK contraseña en cuenta PIN → AUTH_INVALID (anti-enumeración)';

  -- 10. Overload de 3 args delega igual que la función nueva.
  r := public.pulse_account_login('+584249991002', 'Clave123!', 'auto');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL overload 3 args: %', r;
  end if;
  raise notice 'OK overload pulse_account_login/3 delega correctamente';

  -- 11. set-password: cuenta PIN agrega contraseña con su PIN actual.
  r := public.pulse_account_login('+584249991001', '482916');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL setup set-password (login): %', r;
  end if;
  r := public.pulse_account_set_password(
    (select token from public.pulse_sessions where user_id = pin_only_id order by created_at desc limit 1),
    '482916', 'Nueva123!'
  );
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL set-password: %', r;
  end if;
  if (select auth_method from public.pulse_profiles where id = pin_only_id) <> 'both' then
    raise exception 'FAIL set-password debió dejar auth_method=both';
  end if;
  r := public.pulse_account_login_password('+584249991001', 'Nueva123!', 'password');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL login con contraseña recién fijada: %', r;
  end if;
  r := public.pulse_account_login('+584249991001', '482916');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL el PIN original sigue funcionando: %', r;
  end if;
  raise notice 'OK set-password agrega contraseña sin romper el PIN';

  -- 12. set-password con credencial actual mala → AUTH_INVALID (sin oráculo).
  r := public.pulse_account_set_password(
    (select token from public.pulse_sessions where user_id = pin_only_id order by created_at desc limit 1),
    '000000', 'Otra123!'
  );
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'AUTH_INVALID' then
    raise exception 'FAIL set-password con actual mala debió dar AUTH_INVALID: %', r;
  end if;
  raise notice 'OK set-password rechaza credencial actual mala';

  -- 13. set-password con token inválido → SESSION_EXPIRED.
  r := public.pulse_account_set_password('sess_inexistente', '482916', 'Otra123!');
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'SESSION_EXPIRED' then
    raise exception 'FAIL set-password sin sesión debió dar SESSION_EXPIRED: %', r;
  end if;
  raise notice 'OK set-password exige sesión válida';

  -- 14. Registro solo-contraseña → auth_method='password', pin_hash NULL.
  r := public.pulse_account_register_password_only('+584249991003', 'Usuario Prueba Tres', 'testpwd_tres', 'Clave123!');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL registro solo-contraseña: %', r;
  end if;
  if (select auth_method from public.pulse_profiles where phone = '+584249991003') <> 'password' then
    raise exception 'FAIL auth_method esperado password';
  end if;
  if (select pin_hash from public.pulse_profiles where phone = '+584249991003') is not null then
    raise exception 'FAIL pin_hash debió quedar NULL';
  end if;
  raise notice 'OK registro solo-contraseña (auth_method=password, sin PIN)';

  -- 15. Cuenta solo-contraseña entra con contraseña y rechaza PIN con el mismo código.
  r := public.pulse_account_login_password('+584249991003', 'Clave123!', 'password');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL login solo-contraseña: %', r;
  end if;
  r := public.pulse_account_login('+584249991003', '482916');
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'AUTH_INVALID' then
    raise exception 'FAIL PIN en cuenta sin PIN debió dar AUTH_INVALID: %', r;
  end if;
  raise notice 'OK cuenta password-only: entra con clave, PIN da AUTH_INVALID';

  -- 16. Teléfono duplicado en registro solo-contraseña → REGISTER_REJECTED.
  r := public.pulse_account_register_password_only('+584249991003', 'Otro Nombre', 'testpwd_cuatro', 'Clave123!');
  if coalesce((r->>'ok')::boolean, true) or (r->>'code') <> 'REGISTER_REJECTED' then
    raise exception 'FAIL duplicado solo-contraseña debió dar REGISTER_REJECTED: %', r;
  end if;
  raise notice 'OK duplicado solo-contraseña rechazado';
end;
$$;

-- Limpieza final.
delete from public.pulse_profiles where phone in ('+584249991001', '+584249991002', '+584249991003');

-- Verificación de estado (lectura, sin efectos):
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pulse_profiles'
--   and column_name in ('password_hash', 'auth_method', 'password_set_at');
