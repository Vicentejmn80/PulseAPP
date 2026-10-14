import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "20260929190000_sim_scenarios.sql",
  "20260929190100_simulation_engine.sql",
];

for (const name of files) {
  const file = path.join(root, "supabase/migrations", name);
  const query = fs.readFileSync(file, "utf8");
  const out = path.join(root, "scripts", `.mig-${name}.json`);
  fs.writeFileSync(out, JSON.stringify({ name: name.replace(/^\d+_/, "").replace(".sql", ""), query }));
  console.log(name, query.length, "->", out);
}
