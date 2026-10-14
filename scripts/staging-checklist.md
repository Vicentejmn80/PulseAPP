# Staging del acceso por PIN

No ejecutes esta lista contra el proyecto remoto de prueba ni contra producción. El objetivo es un proyecto de Supabase nuevo, vacío de jugadores reales.

## Crear el proyecto

1. En el panel de Supabase, crea un proyecto nuevo. No reutilices el ref del proyecto actual.
2. Anota la URL y guarda la clave `service_role` solo en el entorno del servidor de staging. No la pongas en el frontend ni en el repositorio.
3. En el frontend de staging, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` apuntan a ese proyecto.

## Aplicar la migración

1. No uses `supabase db push`.
2. Aplica únicamente `supabase/migrations/20261011120000_pin_auth_hardening.sql` con el flujo de migraciones de ese proyecto nuevo.
3. Confirma que `anon` no ejecuta `pulse_account_register`, `pulse_account_login`, `pulse_logout`, `pulse_pin_recovery_start` ni `pulse_pin_commit`.
4. Confirma que `anon` sí ejecuta `pulse_load`.

## Variables del servidor de staging

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PULSE_IP_MAX=20`
- `PULSE_IP_WINDOW_SEC=600`
- `PULSE_GLOBAL_FAIL_PER_MIN=40`
- `PULSE_GLOBAL_RESERVE=25`
- `PULSE_ADMIN_ENABLED` vacío. Con el interruptor apagado, `/api/pulse` rechaza `admin-call`.
- `PULSE_ADMIN_SECRET` solo si vas a encender el panel. Mínimo 32 caracteres, fuera del repositorio.
- `PULSE_REGISTRATION_ENABLED` vacío. Para pausar altas sin desplegar, ponlo en `false`.
- `PULSE_TRUSTED_HOPS=1` si el tráfico entra por el proxy de la plataforma. Con 0 se usa la IP del socket y se ignora `X-Forwarded-For`.
- `ENABLE_WHATSAPP_OTP` vacío o distinto de `true`, `1` y `yes`.
- Twilio solo cuando llegue la prueba manual: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`. Usa un número que controles. No envíes a un jugador.

## Repetir las pruebas

1. Alta, ingreso, cinco fallos, ingreso correcto durante el castigo, recuperación con el adaptador falso y cierre de sesión, contra la URL de staging.
2. `SET ROLE anon` sobre las funciones de la sección anterior.
3. Un token del usuario A no devuelve datos del usuario B en `pulse_load`.
4. 20 intentos de ingreso desde una misma IP y el 21 responde 429 con el texto genérico.
5. Revisa los logs: no hay PIN, códigos ni tokens.
6. La prueba manual de Twilio queda fuera de esta lista hasta que una persona envíe un código a un teléfono propio y confirme que el mensaje llegó y que el log no muestra el código.

## Recorrido manual en el cliente real

Marca cada casilla en el teléfono o el navegador de staging. No uses el proyecto de jugadores reales.

- [ ] Alta con un teléfono que controles. La cuenta queda creada y entra a la app.
- [ ] Cierre de sesión y login con el PIN correcto.
- [ ] PIN erróneo. El mensaje no dice si el teléfono existe.
- [ ] Cinco PIN erróneos. El siguiente intento queda limitado y el PIN correcto igual entra.
- [ ] Recuperación: pedir código, recibirlo en un teléfono propio, fijar PIN nuevo y entrar.
- [ ] Una partida o un juego del cliente.
- [ ] Una trivia. Repetir la misma respuesta no suma puntos otra vez.
- [ ] Un pronóstico. Después del inicio del juego ya no se puede guardar.
- [ ] Ranking. El jugador se ve a sí mismo y no ve una liga privada de otra persona.
- [ ] Premios. La pantalla abre. No se entrega un premio solo por aparecer en el top.
- [ ] Ligas. Crear o abrir una liga y confirmar que otro jugador no la ve si no es miembro.
- [ ] Cierre de sesión. Al recargar, la sesión no vuelve sin el PIN.
- [ ] Versión vieja en caché: recargar forzado. Un cliente que todavía llama el alta vieja no crea sesión.

## Purga

No agendes `pulse_auth_purge` en este paso. Cuando el proyecto de staging lleve datos de prueba, la agenda está en `docs/pin-auth-rollout.md`.
