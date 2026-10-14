import { writeFileSync } from "node:fs";
import { buildScenario, SCENARIOS } from "./sim-scenarios.mjs";

function sql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const create = `create table if not exists public.pulse_sim_scenarios (
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
);`;

writeFileSync("scripts/_chunk_create.sql", create);

for (const scenario of SCENARIOS) {
  const doc = buildScenario(scenario);
  const scriptJson = JSON.stringify(doc).replace(/'/g, "''");
  const upsert = `insert into public.pulse_sim_scenarios (
  id, name, description, tension, innings, seconds_per_inning, final_home, final_away, script
) values (
  ${sql(doc.id)},
  ${sql(doc.name)},
  ${sql(doc.description)},
  ${sql(doc.tension)},
  ${doc.innings},
  ${doc.secondsPerInning},
  ${doc.finalHome},
  ${doc.finalAway},
  '${scriptJson}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  tension = excluded.tension,
  innings = excluded.innings,
  seconds_per_inning = excluded.seconds_per_inning,
  final_home = excluded.final_home,
  final_away = excluded.final_away,
  script = excluded.script,
  active = true;`;
  writeFileSync(`scripts/_chunk_${doc.id}.sql`, upsert);
  console.log(doc.id, upsert.length);
}
