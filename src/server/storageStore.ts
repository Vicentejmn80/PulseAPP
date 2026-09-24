import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CloudFile } from "@/server/engineTypes";

const BUCKET = "pulse-state";
const OBJECT_PATH = "pulse-cloud.json";

const EMPTY: CloudFile = {
  profiles: [],
  sessions: [],
  participations: [],
  transactions: [],
  completedMissionIds: {},
  predictionPicks: {},
  extraGames: [],
};

function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "https://ruxwiztdildgnyshajnk.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function useRemoteStore() {
  return Boolean(process.env.VERCEL) || Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY);
}

async function ensureBucket(client: SupabaseClient) {
  const existing = await client.storage.getBucket(BUCKET);
  if (existing.data) return;
  await client.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 5_000_000 });
}

export async function loadRemoteStore(): Promise<CloudFile> {
  const client = adminClient();
  if (!client) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  await ensureBucket(client);
  const { data, error } = await client.storage.from(BUCKET).download(OBJECT_PATH);
  if (error || !data) return structuredClone(EMPTY);
  try {
    const raw = JSON.parse(await data.text()) as Partial<CloudFile>;
    return {
      ...EMPTY,
      ...raw,
      profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      participations: Array.isArray(raw.participations) ? raw.participations : [],
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      extraGames: Array.isArray(raw.extraGames) ? raw.extraGames : [],
      completedMissionIds: raw.completedMissionIds && typeof raw.completedMissionIds === "object" ? raw.completedMissionIds : {},
      predictionPicks: raw.predictionPicks && typeof raw.predictionPicks === "object" ? raw.predictionPicks : {},
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

export async function saveRemoteStore(file: CloudFile) {
  const client = adminClient();
  if (!client) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  await ensureBucket(client);
  const body = JSON.stringify(file);
  const { error } = await client.storage.from(BUCKET).upload(OBJECT_PATH, body, {
    upsert: true,
    contentType: "application/json",
  });
  if (error) throw new Error(error.message);
}
