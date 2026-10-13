# Auditoría de trivias — 12 oct 2026

Fuente de verdad usada: `src/data/triviaIniciado.json` (banco Iniciado, 60 preguntas incorporadas).
No se adjuntó banco de Intermedio ni Avanzado. Esas preguntas **no se vaciaron**.

## Inventario en la app (después del cambio)

| Nivel | Activas | Desactivadas |
| --- | ---: | ---: |
| Iniciado (`easy`) | 60 | 21 (viejas, ya estaban fuera) |
| Intermedio (`medium`) | 16 | 1 (esta auditoría) |
| Avanzado (`hard`) | 15 | 0 |

Rotación: `pulse_trivia_start` solo toma `status = 'active'` y excluye las que el usuario ya respondió mientras queden disponibles. Hay preguntas suficientes en cada nivel (60 / 16 / 15).

## Totales

| Caso | Cantidad |
| --- | ---: |
| Conservadas (mismo texto y respuesta que el banco Iniciado) | 60 |
| Desactivadas ahora (en la app y no en el banco) | 1 |
| Insertadas | 0 |
| Conflictos (mismo prompt, respuesta distinta) | 0 |
| Inválidas al importar | 0 |
| Sospechosas (no cambiadas) | 2 |
| Respuestas de usuarios afectadas | 4 |

Los puntos ya entregados **no se tocaron**.

## Desactivadas

- `25b34f03-6546-4be4-9392-a20d64570007` — «¿Qué equipo lleva los colores negro y amarillo en la LVBP?» / respuesta en app: Águilas del Zulia. No está en el banco Iniciado. Sigue `disabled`. Intermedio y Avanzado quedaron con `review_note = pendiente de verificación`. **4 respuestas** de usuarios quedan como estaban.

Las 21 easy desactivadas de antes siguen archivadas; no se borraron.

## En la app y no en el banco (Intermedio/Avanzado)

Siguen **activas** porque no entregaste esos bancos. Lista Intermedio vigente:

- ¿Cómo se llama el jonrón con las bases llenas?
- ¿Cuál es el nombre del estadio de los Leones del Caracas?
- ¿Qué equipo LVBP tiene el apodo La Tribu?
- ¿Qué posición usa el número 1 en la numeración defensiva del béisbol?
- ¿Qué significa ERA…?
- ¿Qué significa que un lanzador logra un no-hitter?
- Con que equipo MLB gano Miguel Cabrera sus dos premios MVP?
- Cuantas veces gano Johan Santana el Cy Young Award?
- Cuantos Guantes de Oro gano Omar Vizquel…
- Cuantos MVPs consecutivos gano Miguel Cabrera?
- De que ciudad venezolana es originario Luis Aparicio?
- En que ano se fundo la Liga Venezolana de Beisbol Profesional?
- Que equipo LVBP tiene su sede en La Guaira?
- Que venezolano fue inducido al Salon de la Fama de Cooperstown en 1984?
- Que venezolano gano la Triple Corona de bateo en MLB en 2012?
- Quien fue el primer venezolano en ganar el Cy Young Award?

Avanzado: 15 activas, mismo criterio. Pégame esos bancos si quieres el mismo cruce.

## Sospechosas (no cambiadas)

1. Banco P072 `trv_ini_p072` — «¿Qué lanzador venezolano es conocido como «El Torpedo»?» respuesta Freddy García. El propio banco la marcó parecida a P008 (El Rey / Félix Hernández) con otra respuesta. No la toqué.
2. La pregunta desactivada de Águilas negro/amarillo: por conocimiento general los colores del Zulia son negro y naranja. Quedó desactivada por no estar en tu banco, no “corregida”.

## Conflictos / inválidas / insertadas

Ninguno. El lote Iniciado ya coincidía 1:1 con las 60 `trv_ini_p*` activas.
