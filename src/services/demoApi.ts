import { callRpc, readSessionToken } from "@/services/accountApi";

export interface DemoOption {
  id: string;
  label: string;
}

export interface DemoQuestionView {
  id: string;
  atMs: number;
  resolveMs: number;
  prompt: string;
  options: DemoOption[];
  tone: "main" | "quick";
  myOption: string | null;
  revealed: boolean;
  hit?: boolean;
}

export interface DemoEventView {
  inning: number;
  half: "alta" | "baja";
  atMs: number;
  kind: string;
  text: string;
  home: number;
  away: number;
  outs: number;
  bases: number;
}

export interface DemoState {
  ok: boolean;
  error?: string;
  status: "none" | "live" | "finished";
  label: string;
  startedAt: string | null;
  serverNow: string | null;
  events: DemoEventView[];
  questions: DemoQuestionView[];
  hits: number;
  questionCount: number;
  bonus: number;
  finalHome: number | null;
  finalAway: number | null;
  finished: boolean;
}

export interface VenueHighlight {
  icon: string;
  title: string;
  desc: string;
}

export interface VenueCard {
  id: string;
  name: string;
  slug: string;
  zone: string;
  city: string;
  address: string;
  contact: string;
  description: string;
  sponsorText: string;
  roundPrize: string;
  prizeDetail: string;
  prizeQuantity: number;
  prizeTerms: string;
  logoUrl: string;
  imageUrl: string;
  active: boolean;
  qrToken?: string;
  scanCount?: number;
  instagram?: string;
  whatsapp?: string;
  broadcasts?: string;
  isFounder?: boolean;
  cycleId?: string;
  prizeStarts?: string | null;
  prizeEnds?: string | null;
  lat?: number | null;
  lng?: number | null;
  highlights?: VenueHighlight[];
}

function asState(value: unknown): DemoState {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok !== false,
    error: row.error ? String(row.error) : undefined,
    status: row.status === "live" || row.status === "finished" ? row.status : "none",
    label: String(row.label ?? "SIMULACIÓN"),
    startedAt: row.startedAt ? String(row.startedAt) : null,
    serverNow: row.serverNow ? String(row.serverNow) : null,
    events: Array.isArray(row.events) ? (row.events as DemoEventView[]) : [],
    questions: Array.isArray(row.questions) ? (row.questions as DemoQuestionView[]) : [],
    hits: Number(row.hits ?? 0),
    questionCount: Number(row.questionCount ?? 0),
    bonus: Number(row.bonus ?? 0),
    finalHome: row.finalHome === undefined || row.finalHome === null ? null : Number(row.finalHome),
    finalAway: row.finalAway === undefined || row.finalAway === null ? null : Number(row.finalAway),
    finished: Boolean(row.finished),
  };
}

function asVenue(value: unknown): VenueCard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.id) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    zone: String(row.zone ?? ""),
    city: String(row.city ?? ""),
    address: String(row.address ?? ""),
    contact: String(row.contact ?? ""),
    description: String(row.description ?? ""),
    sponsorText: String(row.sponsorText ?? ""),
    roundPrize: String(row.roundPrize ?? ""),
    prizeDetail: String(row.prizeDetail ?? ""),
    prizeQuantity: Number(row.prizeQuantity ?? 0),
    prizeTerms: String(row.prizeTerms ?? ""),
    logoUrl: String(row.logoUrl ?? ""),
    imageUrl: String(row.imageUrl ?? ""),
    active: row.active !== false,
    qrToken: row.qrToken ? String(row.qrToken) : undefined,
    scanCount: row.scanCount === undefined ? undefined : Number(row.scanCount),
    instagram: row.instagram ? String(row.instagram) : undefined,
    whatsapp: row.whatsapp ? String(row.whatsapp) : undefined,
    broadcasts: row.broadcasts ? String(row.broadcasts) : undefined,
    isFounder: Boolean(row.isFounder),
    cycleId: row.cycleId ? String(row.cycleId) : undefined,
    prizeStarts: row.prizeStarts ? String(row.prizeStarts) : null,
    prizeEnds: row.prizeEnds ? String(row.prizeEnds) : null,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    highlights: Array.isArray(row.highlights)
      ? (row.highlights as VenueHighlight[])
      : [],
  };
}

export async function demoState(matchId: string) {
  return asState(await callRpc("pulse_demo_state", { p_token: readSessionToken(), p_match: matchId }));
}

export async function startDemo(matchId: string) {
  const result = asState(await callRpc("pulse_demo_start", { p_token: readSessionToken(), p_match: matchId }));
  if (!result.ok) throw new Error(result.error || "No se pudo empezar la experiencia.");
  return result;
}

export async function answerDemo(matchId: string, questionId: string, optionId: string) {
  const result = asState(await callRpc("pulse_demo_answer", {
    p_token: readSessionToken(),
    p_match: matchId,
    p_question: questionId,
    p_option: optionId,
  }));
  if (!result.ok) throw new Error(result.error || "No se pudo responder.");
  return result;
}

export async function logDemo(matchId: string, type: string, dedupe: string) {
  await callRpc("pulse_demo_log", { p_token: readSessionToken(), p_match: matchId, p_type: type, p_dedupe: dedupe });
}

export async function venueBySlug(slug: string) {
  const data = await callRpc<{ ok?: boolean; error?: string; venue?: unknown }>("pulse_venue_by_slug", { p_slug: slug });
  if (!data?.ok) throw new Error(data?.error || "Esa tasca no está activa.");
  const venue = asVenue(data.venue);
  if (!venue) throw new Error("Esa tasca no está activa.");
  return venue;
}

export async function scanVenue(slug: string) {
  const data = await callRpc<{ ok?: boolean; error?: string; venue?: unknown; already?: boolean; points?: number }>("pulse_venue_scan", {
    p_token: readSessionToken(),
    p_slug: slug,
  });
  if (!data?.ok) throw new Error(data?.error || "No se pudo registrar la visita.");
  const venue = asVenue(data.venue);
  if (!venue) throw new Error("Esa tasca no está activa.");
  return { venue, already: Boolean(data.already), points: Number(data.points ?? 0) };
}

export async function adminVenueList(adminKey: string) {
  const data = await callRpc<unknown>("pulse_admin_venues", { p_admin_key: adminKey });
  return (Array.isArray(data) ? data : []).map(asVenue).filter((venue): venue is VenueCard => Boolean(venue));
}

export async function saveVenue(input: {
  adminKey: string;
  id?: string;
  name: string;
  slug: string;
  zone: string;
  city: string;
  address: string;
  contact: string;
  description: string;
  sponsorText: string;
  prize: string;
  prizeDetail: string;
  quantity: number;
  terms: string;
  starts: string;
  ends: string;
  logo: string;
  image: string;
  active: boolean;
  cycle: string;
  regen: boolean;
}) {
  const data = await callRpc<{ ok?: boolean; error?: string; id?: string; slug?: string }>("pulse_admin_upsert_tasca", {
    p_admin_key: input.adminKey,
    p_id: input.id ?? "",
    p_name: input.name,
    p_slug: input.slug,
    p_zone: input.zone,
    p_city: input.city,
    p_address: input.address,
    p_contact: input.contact,
    p_description: input.description,
    p_sponsor: input.sponsorText,
    p_prize: input.prize,
    p_prize_detail: input.prizeDetail,
    p_quantity: input.quantity,
    p_terms: input.terms,
    p_starts: input.starts || null,
    p_ends: input.ends || null,
    p_logo: input.logo,
    p_image: input.image,
    p_active: input.active,
    p_cycle: input.cycle,
    p_regen: input.regen,
  });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la tasca.");
  return data;
}
