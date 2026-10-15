import { createClient } from "@supabase/supabase-js";

export function serverSupabase() {
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    "XXXXXX";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
    "";

  if (!supabaseUrl) {
    throw new Error("Falta SUPABASE_URL o VITE_SUPABASE_URL en el entorno.");
  }
  if (!serviceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}