/**
 * Reads invoke JSON (name + query) and prints MCP apply_migration args as JSON to stdout.
 * Usage: node scripts/_mcp_apply_invoke.mjs scripts/.invoke-sim_scenarios_seed_cerrado.json
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node _mcp_apply_invoke.mjs <invoke.json>");
  process.exit(1);
}
const { name, query } = JSON.parse(readFileSync(file, "utf8"));
process.stdout.write(JSON.stringify({ name, query }));
