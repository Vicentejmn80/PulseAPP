import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "https://ovgwqeoslaitsmhdkxbl.supabase.co";
const key = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Z3dxZW9zbGFpdHNtaGRreGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDA3NDcsImV4cCI6MjEwNTc3Njc0N30.T6e7hMV-BkuI_RJtRm2qMax5n7DmbTJpNYLVGpO-Vd8";
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
