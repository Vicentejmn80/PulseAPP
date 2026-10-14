insert into public.pulse_sim_seed_buf (id, name, description, tension, innings, seconds_per_inning, final_home, final_away, body)
values ('cerrado', 'Partido cerrado', 'Magallanes abre arriba y Caracas lo empata. El partido se aprieta hasta que el 7.o se vuelve el momento donde todos en la tasca participan.', 'controlado', 9, 120, 9, 8, '')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  tension = excluded.tension,
  innings = excluded.innings,
  seconds_per_inning = excluded.seconds_per_inning,
  final_home = excluded.final_home,
  final_away = excluded.final_away,
  body = '';