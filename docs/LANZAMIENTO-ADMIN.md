# Panel de administración y lanzamiento

Este documento describe lo que queda en el repositorio y lo que no se aplicó en producción.

## Cuenta @chentesa

La consulta de solo lectura encontró una sola cuenta:

- Alias exacto: `@chentesa`
- Teléfono internacional exacto: coincide con `+584242349676`
- El número local `04242349676` no está guardado como identificador
- Ya está en `pulse_admins`, otorgada por `bootstrap_step0` el 13 de octubre de 2026
- No se modificó el perfil, el PIN, la contraseña ni los puntos

El acceso del panel no depende de un botón visible. `/api/admin` llama `pulse_admin_check` con el token de sesión. Si la cuenta no está en `pulse_admins`, responde 403.

## Variables del servidor

El login y el panel necesitan, en Vercel, sin prefijo `VITE_` para la clave privada:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

El navegador sigue usando `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Si faltan las dos primeras, `/api/admin` responde 503 con código `ADMIN_UNAVAILABLE`. Eso no significa que la contraseña esté mal. Un 403 significa que la sesión no es de un administrador.

No pegues la clave `service_role` en el chat ni en el frontend.

## Migración pendiente

El archivo `supabase/migrations/20261016000000_launch_console.sql` no está aplicado.

Hasta aplicarlo:

- El resumen, los usuarios, las campañas, la auditoría nueva y las correcciones de puntos responden que la sección no está activada.
- Registrar un marcador sí puede funcionar, porque reutiliza `pulse_admin_set_result`.
- La tabla de equipos se calcula en la aplicación con los partidos que ya devuelve `pulse_matches_list`.
- Crear o aceptar un reto sigue posible si alguien llama el RPC directamente. La interfaz ya no lo ofrece. La migración sustituye `pulse_reto_create` y `pulse_reto_respond` por un rechazo, sin borrar tablas.

Para aplicarla, revisa el SQL y ejecútalo en el editor de Supabase o con el flujo de migraciones que ya uses. No la apliques dos veces a ciegas: las funciones usan `create or replace` y las tablas `if not exists`.

La migración también hace que una cuenta suspendida deje de resolver su sesión. No activa el vencimiento de sesiones: en producción `pulse_user_id` hoy no mira `expires_at`, y el SQL nuevo conserva ese comportamiento para no cerrar las sesiones actuales.

## Restaurar los retos

Vuelve a crear `pulse_reto_create` y `pulse_reto_respond` desde `supabase/migrations/20261013013000_reto_lock_not_debit.sql` y cambia `USER_RETOS_ENABLED` a `true` en `src/config/retos.ts`.

## Socio

En Accesos se escribe el alias exacto, con `@`, y un motivo. El servidor solo acepta una coincidencia exacta. No se asignó a nadie más.
