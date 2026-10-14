create table if not exists public.pulse_sim_scenarios (
  id text primary key,
  name text not null,
  description text not null default '',
  tension text not null default '',
  innings integer not null default 9,
  seconds_per_inning integer not null default 120,
  final_home integer not null default 0,
  final_away integer not null default 0,
  script jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);