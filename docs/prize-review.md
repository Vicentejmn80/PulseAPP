# Revisión antes de premiar

Los premios no se entregan solos. El top 3 del ranking da acceso a un premio, y una persona tiene que confirmarlo después de esta revisión. No hay un job que pague al cerrar la jornada.

El saldo de cada jugador es `sum(pulse_transactions.points)`. En el esquema local no hay otra columna de puntos. Si en el panel aparece un saldo distinto de esa suma, no premies hasta entender la diferencia.

Para congelar acreditaciones y el ranking de liga, pon `pin_prizes_frozen` en `true` dentro de `pulse_internal_config`. `pulse_credit` deja de escribir y `pulse_league_ranking` responde vacío. Vuelve a `false` cuando la revisión termine. No hace falta desplegar código.

```sql
update public.pulse_internal_config
set value = 'true'
where key = 'pin_prizes_frozen';
```

## Top 10

```sql
with totals as (
  select user_id, sum(points)::int as points
  from public.pulse_transactions
  group by user_id
),
top as (
  select profile.id, profile.alias, profile.created_at, totals.points
  from totals
  join public.pulse_profiles profile on profile.id = totals.user_id
  order by totals.points desc, profile.created_at
  limit 10
)
select
  top.alias,
  top.points,
  top.created_at as account_created,
  hour_bucket.hour,
  hour_bucket.points as points_in_hour,
  hour_bucket.actions
from top
left join lateral (
  select date_trunc('hour', created_at) as hour,
         sum(points)::int as points,
         count(*)::int as actions
  from public.pulse_transactions tx
  where tx.user_id = top.id
  group by 1
  order by points desc
  limit 1
) hour_bucket on true
order by top.points desc;
```

Acciones por tipo, para esas mismas cuentas:

```sql
with top as (
  select user_id
  from public.pulse_transactions
  group by user_id
  order by sum(points) desc
  limit 10
)
select tx.user_id, tx.source_type, count(*)::int as actions, sum(tx.points)::int as points
from public.pulse_transactions tx
join top on top.user_id = tx.user_id
group by 1, 2
order by 1, points desc;
```

## Anomalías

- Pico: un jugador del top con 30 o más puntos en una sola hora.
- Cuenta nueva: `created_at` del perfil en las últimas 48 horas y ya está en el top 10.
- Mismo origen repetido: la consulta de acreditaciones repetidas en `docs/pin-auth-alerts.md`.
- Misma IP o mismo dispositivo: `pulse_transactions` y `pulse_auth_events` no guardan IP ni dispositivo. No inventes ese cruce. El límite por IP vive en el proceso de `/api/pulse` y no queda en la base.

## Paso manual

1. Congela con `pin_prizes_frozen=true`.
2. Corre las dos consultas y la de acreditaciones repetidas.
3. Si hay pico, cuenta nueva en el top o un origen repetido, saca a ese jugador de la entrega y anota el alias.
4. Entrega el premio a las personas que queden en los tres primeros, fuera de la aplicación.
5. Deja el congelamiento en `false` solo cuando ya no se vayan a acreditar puntos de esa jornada.
