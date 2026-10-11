-- Ventana de la Ronda 1 para el lanzamiento de Béisbol Rush LVBP.
-- Inicio: 12 de octubre de 2026. Cierre: 22 de octubre de 2026 a las 23:59
-- America/Caracas. El instante exacto ya lo calcula pulse_admin_close_round
-- como (ends_on + time '23:59:59') at time zone 'America/Caracas'.
-- Un partido pertenece a la ronda según la fecha de inicio en Caracas
-- (between starts_on and ends_on). Rondas 2 y 3 no se tocan.

update public.pulse_cycles
set starts_on = date '2026-10-12',
    ends_on = date '2026-10-22'
where id = 'ronda_1';
