import { createClient } from "@supabase/supabase-js";
import os from "node:os";

const url = process.env.VITE_SUPABASE_URL || "https://ovgwqeoslaitsmhdkxbl.supabase.co";
const key = process.env.VITE_SUPABASE_ANON_KEY || "";
if (!key) {
  console.error("Falta VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}
const adminKey = process.env.PULSE_ADMIN_KEY || "TOBO-ADMIN";

function lan() {
  const skip = /tun|vpn|virtual|hyper-v|wsl|vethernet|bluetooth|loopback/i;
  const found = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) found.push(entry.address);
    }
  }
  return found.find((address) => address.startsWith("192.168.")) || found[0] || "127.0.0.1";
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase.rpc("pulse_seed_test_scenario", { p_admin_key: adminKey });
if (error) {
  console.error(error.message);
  process.exit(1);
}
const token = data?.qrToken;
const host = lan();
console.log(JSON.stringify({ ...data, open: `http://${host}:5173/`, qr: `http://${host}:5173/q/${token}`, admin: `http://${host}:5173/admin/partidos` }, null, 2));
