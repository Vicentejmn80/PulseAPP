insert into public.pulse_sim_seed_buf (id, name, description, tension, innings, seconds_per_inning, final_home, final_away, body)
values ('remontada', 'Remontada', 'Caracas va tres abajo, se acerca de golpe en el 3.o y lo voltea en el 6.o. El momento donde la tasca enciende el telefono.', 'escala', 9, 120, 9, 4, '')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  tension = excluded.tension,
  innings = excluded.innings,
  seconds_per_inning = excluded.seconds_per_inning,
  final_home = excluded.final_home,
  final_away = excluded.final_away,
  body = '';