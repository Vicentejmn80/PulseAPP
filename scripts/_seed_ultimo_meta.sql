insert into public.pulse_sim_seed_buf (id, name, description, tension, innings, seconds_per_inning, final_home, final_away, body)
values ('ultimo', 'Ultimo inning dramatico', 'Partido parejo hasta el final. El 9.o empieza abajo por una y Caracas lo da vuelta con un hit. El momento para mostrarle a un tasca que pasa cuando todos participan.', 'climax', 9, 120, 4, 3, '')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  tension = excluded.tension,
  innings = excluded.innings,
  seconds_per_inning = excluded.seconds_per_inning,
  final_home = excluded.final_home,
  final_away = excluded.final_away,
  body = '';