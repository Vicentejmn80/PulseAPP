import { writeFileSync } from "node:fs";
import { buildScenario, SCENARIOS } from "./sim-scenarios.mjs";

const CHUNK = 6000;

for (const scenario of SCENARIOS) {
  const doc = buildScenario(scenario);
  const json = JSON.stringify(doc);
  const esc = (value) => String(value).replace(/'/g, "''");
  const meta = `insert into public.pulse_sim_seed_buf (id, name, description, tension, innings, seconds_per_inning, final_home, final_away, body)
values ('${esc(doc.id)}', '${esc(doc.name)}', '${esc(doc.description)}', '${esc(doc.tension)}', ${doc.innings}, ${doc.secondsPerInning}, ${doc.finalHome}, ${doc.finalAway}, '')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  tension = excluded.tension,
  innings = excluded.innings,
  seconds_per_inning = excluded.seconds_per_inning,
  final_home = excluded.final_home,
  final_away = excluded.final_away,
  body = '';`;
  writeFileSync(`scripts/_seed_${doc.id}_meta.sql`, meta);
  let index = 0;
  for (let i = 0; i < json.length; i += CHUNK) {
    const part = esc(json.slice(i, i + CHUNK));
    const sql = `update public.pulse_sim_seed_buf set body = body || '${part}' where id = '${esc(doc.id)}';`;
    writeFileSync(`scripts/_seed_${doc.id}_${index}.sql`, sql);
    console.log(doc.id, index, sql.length);
    index += 1;
  }
}
