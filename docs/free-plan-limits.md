# Límites del plan Free

Los números que Supabase publica en el panel no están en este repositorio. Donde dice "verificar en el panel", míralo en el proyecto antes de tratarlo como un tope real. No uses estas notas como una cuota inventada.

## Backups

No hay backup automático. El comando, el lugar donde guardarlo y la restauración están en `scripts/backup-db.md`. Hazlo antes de cada despliegue.

## Pausa por inactividad

Un proyecto Free se pausa si nadie lo usa durante unos días. Verificar en el panel el plazo exacto.

Para evitar la pausa, una visita periódica a la URL pública de la app basta. No hace falta un usuario ni un token. No envíes la clave `service_role` en ese keepalive. Un cron externo que haga `GET` a la home, sin cuerpo y sin encabezados de autorización, es suficiente.

Si el proyecto ya está pausado, se reactiva desde el panel de Supabase, con el botón de restaurar el proyecto. La primera petición después de eso puede tardar. Verificar en el panel el tiempo de reactivación.

## Conexiones

La aplicación no abre una sesión de Postgres. El navegador y `/api/pulse` hablan con PostgREST por HTTPS. No hay `DATABASE_URL` ni un cliente `pg` en el servidor.

Si más adelante alguien agrega una conexión directa, tiene que ser el pooler de Supabase en modo transacción (el puerto que el panel marca como transaction, hoy documentado por Supabase como 6543). Verificar en el panel el host y el puerto. La conexión directa (5432) se reserva para `pg_dump` y para una sesión de mantenimiento.

En el código de las migraciones de PIN el único candado es `pg_advisory_xact_lock`, que vive dentro de la transacción y es compatible con el modo transacción. No hay `PREPARE`, no hay `pg_advisory_lock` de sesión y no hay `SET` sin `LOCAL`. El `search_path` está en la función.

El tamaño del pool y el máximo de conexiones del plan Free: verificar en el panel. La prueba local con un límite chico de conexiones está en el informe de esta ronda.

## bcrypt

El costo guardado en la migración es 10. No lo bajes de 10.

Medición en esta máquina, Postgres local, costo 10:

- Un `crypt` suelto tuvo mediana de unos 98–100 ms.
- Un ingreso hace dos `crypt`. Con 4 trabajadores durante 8 segundos salieron 76 ingresos: 9,3 por segundo, p50 418 ms, p95 529 ms.
- Con el límite de conexiones de la base en 4, un rol normal abrió 4 y las otras 4 fueron rechazadas. El límite quedó otra vez en ilimitado.

Una instancia pequeña del plan Free tiene menos CPU que esta máquina. Verificar en el panel el tamaño. Mide en staging el mismo ingreso, con costo 10, antes de abrir a 200 personas. Si el p95 del ingreso correcto pasa de unos 2 segundos de forma sostenida, no subas el escalón. No bajes el costo para ganar velocidad: a costo 8 el `crypt` local bajó a unos 23 ms, y eso queda por debajo del mínimo de 10.

## Varias instancias

El límite de intentos usa memoria del proceso si no están `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. No hay dependencia de pago. Con varias instancias de Vercel, cada una cuenta sus propios fallos: el modo memoria es solo un freno, no un tope global. El almacén REST comparte el conteo. La reserva del tope global también se comparte cuando ese almacén está configurado.
