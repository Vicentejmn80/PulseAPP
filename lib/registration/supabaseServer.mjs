import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  "https://ovgwqeoslaitsmhdkxbl.supabase.co";

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
  "";

if (!SUPABASE_URL) {
  throw new Error("Falta SUPABASE_URL o VITE_SUPABASE_URL en el entorno.");
}
if (!SERVICE_ROLE_KEY) {
  throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_SERVICE_ROLE_KEY en el entorno.");
}

export function serverSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}