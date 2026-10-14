# Despliegue del acceso por PIN

Este documento describe el orden. No lo ejecutes como parte de una prueba local.

## Backup previo

1. Anota el ref del proyecto y la hora.
2. En el panel de Supabase, crea un backup o descarga uno lógico de solo lectura.
3. Guarda aparte el cuerpo actual de `pulse_account_login` y `pulse_load` (`pg_get_functiondef`) por si hay que comparar.
4. Confirma que `pulse_sessions` todavía no tiene `expires_at` en ese proyecto, o anota el default si ya existe.
5. No uses `supabase db push`.

## Fase 1, parche de emergencia

Se aplica sola, sin la migración de PIN y sin cambiar el frontend. El cliente que hoy está desplegado sigue llamando alta, ingreso, carga, alias y el panel admin con la clave anónima. Esas funciones no se tocan.

1. Respaldo manual con el comando de `scripts/backup-db.md`. Guárdalo fuera del repositorio.
2. Aplica solo `supabase/migrations/20261012120000_phase1_revocations.sql`. No uses `supabase db push`. El archivo `supabase/optional/pulse_harden_new_public.sql` no entra en este paso. En Supabase, `postgres` puede crear event triggers por la extensión `supautils` aunque no sea superusuario. Si ese archivo opcional falla, la Fase 1 ya está aplicada y se deja así.
3. Verifica: `anon` sigue ejecutando `pulse_account_login`, `pulse_account_register` y `pulse_load`. `anon` ya no ejecuta `pulse_award_plenos`, `pulse_sim_clear`, `pulse_live_apply`, `pulse_sim_tick`, `pulse_credit` ni `pulse_otp_provider`. `anon` no lee `pulse_sim_scenarios`.
4. Una partida, el ranking y una carga de sesión del cliente actual siguen respondiendo.

Criterio para revertir la Fase 1: el cliente desplegado no puede iniciar sesión, cargar la sesión, jugar, ver el ranking o abrir el panel admin. La reversión es una migración hacia adelante que devuelve `EXECUTE` solo a la función que se rompió, no un `ROLLBACK` de efectos ya aplicados. No reviertas `pulse_otp_provider` ni `pulse_credit` hacia `anon` si el fallo está en otra función.

`otpAuth.mjs` no cambia. Con `ENABLE_WHATSAPP_OTP` apagado no llama a `pulse_otp_provider`. Si esa bandera se enciende, el servidor ya usa la clave `service_role`.

## Fase 2, PIN, admin y ranking

Va después de la Fase 1, con backup nuevo. La migración de PIN y el frontend/API salen juntos. Si se aplica la migración sin el frontend nuevo, el panel admin del navegador deja de poder llamar `pulse_admin_*` con la clave anónima.

1. Respaldo manual.
2. Publica juntos `supabase/migrations/20261011120000_pin_auth_hardening.sql`, el frontend y `/api/pulse`.
3. En el servidor: `SUPABASE_SERVICE_ROLE_KEY`, `PULSE_TRUSTED_HOPS=1` en Vercel, `PULSE_GLOBAL_RESERVE=25`, `PULSE_ADMIN_ENABLED` vacío (apagado) y `PULSE_REGISTRATION_ENABLED` vacío (abierto). Antes de encender el panel, sustituye la clave de `pulse_admin_keys`: la que está en el repositorio tiene 10 caracteres y `pulse_require_admin` responde falso si la clave guardada o la enviada tiene menos de 32. Genera una nueva fuera del repo. No reutilices la corta.
4. Verifica alta, ingreso, PIN erróneo, recuperación, carga, ranking, una liga y que `anon` no ejecuta las funciones admin.

Criterio para revertir la Fase 2: el alta o el ingreso por PIN fallan para cuentas que ya tenían `pin_hash`, o `pulse_load` deja de restaurar la sesión. Aplica `scripts/pin_auth_forward_rollback.sql`. No devuelve los `GRANT` de admin a `anon`. Si el panel admin tiene que volver a funcionar con el cliente viejo, hace falta una migración aparte que los devuelva, y eso reabre el hueco de la Fase 1: no la hagas como primer recurso.

## Lanzamiento gradual

Mira estas consultas de `docs/pin-auth-alerts.md` antes de subir cada escalón: PIN inválidos por HMAC, tope global, puntos por hora y errores 5xx de `/api/pulse`.

1. 20 a 50 personas. Si en una hora hay un `pin_global_cap`, un jugador con 30 puntos o más, o el ingreso correcto falla, no subas.
2. 200 personas. El mismo criterio, más el p95 del ingreso. Si el p95 pasa de unos 2 segundos de forma sostenida, no abras.
3. Abierto. El registro se puede pausar en un minuto con `PULSE_REGISTRATION_ENABLED=false` o con `pin_registration_enabled=false` en `pulse_internal_config`, sin desplegar código.

## Detalle de la Fase 2

La migración de PIN y el frontend/API salen juntos. Las funciones viejas `pulse_register`, `pulse_login` y `pulse_otp_finish` quedan en `LEGACY_AUTH_DISABLED` y pierden `EXECUTE` para `anon`.

1. Publica el frontend y la API juntos. El alta, el ingreso y el cierre de sesión (`pulse_account_register`, `pulse_account_login`, `pulse_logout`) los llama el servidor con `SUPABASE_SERVICE_ROLE_KEY`. Sin esa clave el acceso responde error genérico y no usa la clave anónima. `pulse_load` sigue llamándose desde el navegador con la clave anónima.
2. En la misma ventana, aplica solo `supabase/migrations/20261011120000_pin_auth_hardening.sql` con el flujo de migraciones del proyecto (no un push de todo el historial).
3. La recuperación llama `pulse_pin_recovery_start` y `pulse_pin_commit` con la clave `service_role` del servidor. El envío usa `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_WHATSAPP_NUMBER` en el entorno del servidor. No usa `pulse_otp_provider`.
4. `pulse_otp_provider` queda ejecutable solo por `postgres` y `service_role`.

## Clientes con la versión vieja en caché

Un cliente cacheado puede seguir llamando `pulse_register`, `pulse_login` o `pulse_otp_finish`. Esas llamadas no crean sesión. Quien tenga la pantalla vieja de código de acceso no entra hasta recargar la aplicación. La clave anónima ya no ejecuta el alta, el ingreso ni el cierre de sesión: si un cliente viejo los llama directo, Postgres responde permiso denegado y el límite por IP del servidor no se puede saltar.

`pulse_otp_consume` no se reemplaza. Sigue insertando en `pulse_sessions` sin nombrar `expires_at`. La columna tiene `DEFAULT now() + interval '30 days'`, así que ese insert no falla y la sesión caduca a los 30 días.

## Verificación posterior

1. Alta con un teléfono de prueba que controles. Un segundo alta del mismo teléfono o del mismo alias responde `REGISTER_REJECTED`.
2. Ingreso con PIN correcto responde `SESSION_CREATED`. Cinco PIN malos y uno más responden `PIN_RATE_LIMITED` sin mover otra vez `next_allowed_at`. El PIN correcto entra durante esa ventana.
3. `SET ROLE anon` no lee `pulse_profiles`, `pulse_sessions`, `pulse_internal_config`, `pulse_pin_attempts`, `pulse_auth_events` ni `pulse_pin_challenges`.
4. `anon` no ejecuta `pulse_snapshot`, `pulse_otp_provider`, `pulse_pin_recovery_start` ni `pulse_pin_commit`.
5. Revisa que los logs no contienen PIN, códigos ni tokens.

## Cuándo revertir

Revierte si el alta o el ingreso por PIN fallan para cuentas que ya tenían `pin_hash`, o si `pulse_otp_consume` empieza a fallar al insertar la sesión.

1. Aplica `scripts/pin_auth_forward_rollback.sql`. Es una migración hacia adelante: restaura el login y `pulse_load` anteriores, deja `expires_at`, deja los stubs y no devuelve los `GRANT` retirados.
2. No vuelvas a dar `EXECUTE` de `pulse_snapshot` ni de `pulse_otp_provider` a `anon`.
3. El login restaurado vuelve a distinguir cuenta inexistente. Úsalo solo para recuperar el servicio, y vuelve a la migración principal en cuanto el fallo esté entendido.

## Escalado del PIN

La primera ventana de castigo dura 15 minutos. Si el castigo se repite dentro de las 24 horas, la siguiente dura 1 hora y la siguiente 24 horas. `pulse_pin_attempts.lock_level` guarda el nivel (1, 2 o 3). Un ingreso con PIN correcto lo deja en 0. Dentro de una ventana activa, `next_allowed_at` no se mueve. Cada subida de nivel escribe `pulse_auth_events` con evento `pin_lock_level`.

## Límites en /api/pulse

Los valores viven en `pulse_internal_config` y en el entorno del servidor. Deben coincidir.

| clave en la base | variable | valor inicial |
| --- | --- | --- |
| pin_ip_max | PULSE_IP_MAX | 20 |
| pin_ip_window_sec | PULSE_IP_WINDOW_SEC | 600 |
| pin_global_fail_per_min | PULSE_GLOBAL_FAIL_PER_MIN | 40 |
| pin_global_reserve | PULSE_GLOBAL_RESERVE | 25 |
|  | PULSE_TRUSTED_HOPS | 0 |

El rechazo es HTTP 429 con `PIN_RATE_LIMITED` y el texto genérico de demasiados intentos. No dice si el teléfono existe. Al superar el tope global se registra `pin_global_cap` / `GLOBAL_FAIL_CAP`, como máximo una vez por segundo.

La IP que cuenta es la del socket. `PULSE_TRUSTED_HOPS=0` ignora `X-Forwarded-For`, porque el cliente puede escribirlo. En Vercel hay un proxy: pon `PULSE_TRUSTED_HOPS=1` para usar la dirección que la plataforma agrega al final de la lista, no la primera. No uses la primera entrada de `X-Forwarded-For`.

Cuando el tope global está lleno, quedan `pin_global_reserve` intentos por minuto que sí llegan a la base. Sirven para que una persona en otra IP pueda entrar durante un ataque. Esos intentos siguen pasando por bcrypt.

## OTP anterior

`pulse_otp_issue` y `pulse_otp_consume` siguen en el servidor solo si `ENABLE_WHATSAPP_OTP` está activo. Con la bandera apagada, `sendOtp` responde `OTP_DISABLED` y no llama a Twilio ni a la función. Si la función existe, la migración la deja en 3 envíos por hora y 5 por 24 horas, guarda el código con `crypt` y quita `EXECUTE` a `anon`. `pulse_otp_consume` ya cortaba a los 5 intentos y a los 10 minutos; no se reescribe. El servidor las llama con `service_role`.

## Identidad y tablas abiertas

Las funciones que reciben un id de jugador (`pulse_credit`, `pulse_bingo_payload`, `pulse_live_payload`, `pulse_log_event`, `pulse_mark_play_day`, `pulse_streak_length`, `pulse_streak_start`, `pulse_sync_streak`, `pulse_cycle_points`, `pulse_direct_enter`) pierden `EXECUTE` para `anon` si existen. Son `SECURITY DEFINER`; las RPC de juego que sí usa el cliente siguen llamándolas como dueño. `pulse_load` deriva el jugador del token.

Las 42 funciones `pulse_admin_*` llaman `pulse_require_admin` al inicio del cuerpo. El secreto no se escribe en los logs de esta ronda.

Toda tabla `pulse_*` que esté sin RLS queda con RLS activo y sin privilegios para `anon`. `pulse_sim_scenarios` entra en ese grupo.

## Purga

`pulse_auth_purge()` borra eventos de más de 90 días, intentos de PIN inactivos (nivel 0 y sin castigo, sin tocar en 90 días), desafíos de recuperación vencidos hace más de un día y sesiones vencidas. Solo `service_role` puede ejecutarla. No está agendada en el remoto.

Para agendarla en un proyecto donde `pg_cron` ya existe:

```sql
select cron.schedule('pulse-auth-purge', '15 4 * * *', $$select public.pulse_auth_purge()$$);
```

Si no hay `pg_cron`, un cron del sistema puede llamar la función una vez al día con la clave `service_role`.

## Verificación de esta ronda

1. `SET ROLE anon` no ejecuta `pulse_account_register`, `pulse_account_login` ni `pulse_logout`. Sí ejecuta `pulse_load`.
2. Cinco PIN malos dejan `lock_level = 1` y unos 15 minutos. Tras simular que esa ventana terminó, otros cinco dejan nivel 2 (1 hora) y otros cinco nivel 3 (24 horas). El PIN correcto entra en cada nivel y vuelve el nivel a 0.
3. Un token de A, pasado a `pulse_load`, devuelve el perfil de A.
4. `select public.pulse_auth_purge()` reduce filas viejas y no toca un evento recién creado.
