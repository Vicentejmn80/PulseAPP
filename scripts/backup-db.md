# Respaldo manual antes de cada despliegue

El plan Free de Supabase no hace backups automáticos. Haz este respaldo antes de aplicar la Fase 1 y otra vez antes de la Fase 2. Guarda el archivo fuera del repositorio y fuera de la carpeta del proyecto.

Sustituye la cadena de conexión por la del panel, modo sesión o conexión directa, solo para este volcado. No pongas esa cadena en el código ni en un archivo que se suba a git.

```text
pg_dump --format=custom --no-owner --no-privileges --schema=public --file=rusher-YYYYMMDD-HHMM.dump "postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
```

En esta máquina el binario es:

```text
C:\Users\Vicente\AppData\Local\rusher-pg\postgresql-16.8.0-x86_64-pc-windows-msvc\bin\pg_dump.exe
```

El archivo contiene esquema y datos. No lo abras en el chat ni lo copies al repo.

## Restaurar en una base nueva

Crea una base vacía y restaura ahí. No restaures encima de la base que está sirviendo jugadores.

```text
pg_restore --no-owner --no-privileges --dbname="postgresql://USER:PASSWORD@NUEVA_HOST:5432/postgres?sslmode=require" rusher-YYYYMMDD-HHMM.dump
```

Comprueba que `pulse_load` existe y que una cuenta de prueba sigue en `pulse_profiles`. Después apunta el servidor a esa base solo si decidiste cambiar de proyecto.

La prueba local de este procedimiento está en el informe de la ronda: volcado de `rusher_pin_local` y restauración en una base local nueva.
