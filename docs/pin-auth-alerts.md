# Alertas del acceso por PIN

Consultas de solo lectura. Los umbrales son el punto en el que conviene mirar, no un corte automático. No imprimen teléfonos, PIN ni tokens: el teléfono va como HMAC.

## Picos de THROTTLED

Un teléfono está dentro de una ventana de castigo y sigue probando.

```sql
select date_trunc('minute', created_at) as minute, count(*)::int as n
from public.pulse_auth_events
where event = 'pin_login'
  and reason = 'THROTTLED'
  and created_at > now() - interval '1 hour'
group by 1
order by 1;
```

Umbral: más de 30 en un minuto, o más de 100 en una hora.

## Subidas de nivel de bloqueo

```sql
select date_trunc('hour', created_at) as hour, reason as level, count(*)::int as n
from public.pulse_auth_events
where event = 'pin_lock_level'
  and created_at > now() - interval '24 hours'
group by 1, 2
order by 1, 2;
```

Umbral: cualquier `reason = '3'` (ventana de 24 horas), o más de 10 subidas a nivel 2 en una hora.

## PIN_INVALID por IP

Esta tabla no guarda la IP. El límite por IP vive en el proceso de `/api/pulse`. Lo que sí queda en la base es el fallo de PIN, agrupado por el HMAC del teléfono.

```sql
select phone_hmac, count(*)::int as n
from public.pulse_auth_events
where event = 'pin_login'
  and reason in ('PIN_MISMATCH', 'NO_ACCOUNT', 'PIN_NOT_SET', 'MALFORMED')
  and created_at > now() - interval '10 minutes'
group by 1
having count(*) >= 5
order by n desc;
```

Umbral: 5 o más fallos de un mismo HMAC en 10 minutos. Si muchos HMAC distintos aparecen a la vez, es un ataque repartido: míralo junto al tope global.

## Tope global

```sql
select date_trunc('minute', created_at) as minute, count(*)::int as n
from public.pulse_auth_events
where event = 'pin_global_cap'
  and created_at > now() - interval '1 hour'
group by 1
order by 1;
```

Umbral: cualquier minuto con una fila. El servidor anota como máximo una vez por segundo.

## INVALID_TOKEN

```sql
select date_trunc('minute', created_at) as minute, reason, count(*)::int as n
from public.pulse_auth_events
where event = 'pin_load'
  and reason in ('INVALID_TOKEN', 'EXPIRED')
  and created_at > now() - interval '1 hour'
group by 1, 2
order by 1, 2;
```

Umbral: más de 50 `INVALID_TOKEN` en 10 minutos. Unos pocos `EXPIRED` son sesiones que cumplieron 30 días.

## Desafíos de recuperación por hora

```sql
select date_trunc('hour', created_at) as hour, count(*)::int as n
from public.pulse_pin_challenges
where created_at > now() - interval '24 hours'
group by 1
order by 1;
```

Umbral: más de 30 desafíos en una hora en todo el proyecto, o un mismo `phone_hmac` con 3 en una hora (el tope de esa función). El cuerpo no incluye el código.

## Puntos por hora

El saldo de un jugador es la suma de `pulse_transactions.points`. No hay otra columna de saldo.

```sql
select user_id, date_trunc('hour', created_at) as hour, sum(points)::int as points, count(*)::int as actions
from public.pulse_transactions
where created_at > now() - interval '24 hours'
group by 1, 2
having sum(points) >= 30
order by points desc;
```

Umbral: 30 o más puntos en una hora para un jugador. Antes de un premio, usa la consulta de `docs/prize-review.md`.

## Acreditaciones repetidas

La clave única es `(source_type, source_id)`. Más de una fila con la misma clave no debería existir. Esta consulta busca el mismo origen repetido y también un origen que cambió de puntos.

```sql
select source_type, source_id, count(*)::int as rows, min(points) as min_points, max(points) as max_points
from public.pulse_transactions
group by 1, 2
having count(*) > 1 or min(points) is distinct from max(points)
order by rows desc;
```

Umbral: cualquier resultado. Si aparece, el índice único no se cumplió. Un cambio de puntos sobre el mismo origen reemplaza la fila y no queda en esta consulta.

## Llamadas admin

```sql
select date_trunc('hour', created_at) as hour, reason as fn, count(*)::int as n
from public.pulse_auth_events
where event = 'admin_call'
  and created_at > now() - interval '24 hours'
group by 1, 2
order by 1, 2;
```

Umbral: cualquier llamada con `PULSE_ADMIN_ENABLED` apagado, o un nombre de función que no esperabas. La consulta no incluye el secreto.

## Cambios de nivel de bloqueo

La consulta de "Subidas de nivel de bloqueo" de arriba es la que hay que mirar. Un `reason` de `1`, `2` o `3` es el nivel nuevo. Compara la hora con los PIN inválidos del mismo período.
