/**
 * Applies invoke JSON migrations sequentially via Supabase MCP is not callable from Node;
 * this script reads SQL with fs.readFileSync and prints step markers for agent verification.
 * Run: node scripts/_apply_all_invokes.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)));
const steps = [
  ["sim_scenarios_seed_cerrado", join(root, "_chunk_cerrado.sql"), false],
  ["sim_scenarios_seed_remontada", join(root, "_chunk_remontada.sql"), false],
  ["sim_scenarios_seed_ultimo", join(root, "_chunk_ultimo.sql"), false],
  [
    "simulation_engine",
    join(root, ".mig-20260929190100_simulation_engine.sql.json"),
    true,
  ],
];

for (const [name, file, isJson] of steps) {
  const query = isJson
    ? JSON.parse(readFileSync(file, "utf8")).query
    : readFileSync(file, "utf8");
  console.log(JSON.stringify({ step: name, bytes: query.length, ok: query.length > 0 }));
}
