import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "https://ovgwqeoslaitsmhdkxbl.supabase.co";
const key = process.env.VITE_SUPABASE_ANON_KEY || "";
if (!key) {
  console.error("Falta VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}
const adminKey = process.env.PULSE_ADMIN_KEY || "TOBO-ADMIN";
const includeVenue = process.argv.includes("--include-venue");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase.rpc("pulse_cleanup_test", {
  p_admin_key: adminKey,
  p_include_venue: includeVenue,
});
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(JSON.stringify(data, null, 2));
