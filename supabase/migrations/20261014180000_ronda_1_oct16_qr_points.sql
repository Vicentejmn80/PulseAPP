-- Ronda 1: del 16 al 22 de octubre de 2026.
-- No cambia rondas 2 y 3, ni la hora de los partidos.
-- La interfaz lee starts_on/ends_on; este es el origen de esas fechas.

update public.pulse_cycles
set starts_on = date '2026-10-16'
where id = 'ronda_1';

-- Puntos de un QR de local aliado. pulse_qr_visit lee QR_POINTS.
-- El cliente no envía la cantidad. El índice único
-- (user_id, venue_id, scan_date) ya impide acreditar dos veces el mismo día.
update public.pulse_pilot_config
set value = '50'::jsonb
where key = 'QR_POINTS';
