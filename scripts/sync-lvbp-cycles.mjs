/**
 * Alinea ronda_1/2/3 en Supabase con las fechas del MVP (America/Caracas).
 * Requiere VITE_SUPABASE_ANON_KEY (o SUPABASE_ANON_KEY) y PULSE_ADMIN_KEY.
 *
 *   node scripts/sync-lvbp-cycles.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ovgwqeoslaitsmhdkxbl.supabase.co";
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const adminKey = process.env.PULSE_ADMIN_KEY || "TOBO-ADMIN";

const cycles = [
  { id: "ronda_1", name: "Ronda 1", startsOn: "2026-10-12", endsOn: "2026-10-22" },
  { id: "ronda_2", name: "Ronda 2", startsOn: "2026-10-23", endsOn: "2026-10-29" },
  { id: "ronda_3", name: "Ronda 3", startsOn: "2026-10-30", endsOn: "2026-11-05" },
];

if (!key) {
  console.error("Falta VITE_SUPABASE_ANON_KEY o SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

for (const cycle of cycles) {
  const { data, error } = await supabase.rpc("pulse_admin_create_cycle", {
    p_admin_key: adminKey,
    p_id: cycle.id,
    p_name: cycle.name,
    p_starts_on: cycle.startsOn,
    p_ends_on: cycle.endsOn,
  });
  if (error) {
    console.error(cycle.id, error.message);
    process.exit(1);
  }
  if (!data?.ok) {
    console.error(cycle.id, data?.error || "falló");
    process.exit(1);
  }
  console.log(`${cycle.id}: ${cycle.startsOn} → ${cycle.endsOn}`);
}

const { data: listed, error: listError } = await supabase.rpc("pulse_cycles_list");
if (listError) {
  console.error(listError.message);
  process.exit(1);
}
console.log(JSON.stringify(listed, null, 2));
