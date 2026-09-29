import { callRpc, readSessionToken } from "@/services/accountApi";

export interface Choice {
  id: string;
  label: string;
}

export interface LiveQuestion {
  id: string;
  matchId: string;
  prompt: string;
  options: Choice[];
  status: "draft" | "open" | "closed" | "resolved" | "void";
  closesAt: string | null;
  myOption: string | null;
  correctOption: string | null;
  points: number | null;
  awayTeam: string;
  homeTeam: string;
  livePoints: number;
  answers?: number;
}

export interface BingoEvent {
  id: string;
  label: string;
}

export interface BingoBoard {
  catalog: BingoEvent[];
  picks: string[] | null;
  locked: boolean;
  occurred: string[];
  status: string;
  points: number | null;
  eventPoints: number;
  fullBonus: number;
}

export interface PlenoStatus {
  show: boolean;
  games: number;
  predicted?: number;
  correct?: number;
  possible?: boolean;
  awarded?: boolean;
  bonus?: number;
}

export interface StreakState {
  length: number;
  nextDays: number | null;
  nextPoints: number | null;
}

export interface HomeBoard {
  live: LiveQuestion[];
  pleno: PlenoStatus;
  streak: StreakState;
}

export interface MatchBoard {
  live: LiveQuestion[];
  bingo: BingoBoard;
}

export interface QrVisit {
  ok?: boolean;
  already?: boolean;
  points?: number;
  error?: string;
  venue?: {
    id: string;
    name: string;
    zone: string;
    address: string;
    contact: string;
    broadcasts: string;
    isFounder: boolean;
  };
  flash?: {
    id: string;
    prompt: string;
    options: Choice[];
    closesAt: string;
    status: string;
    myOption: string | null;
    correctOption: string | null;
    points: number;
  } | null;
}

export interface AdminVenue {
  id: string;
  name: string;
  zone: string;
  qrToken: string;
  broadcasts: string;
  address: string;
  instagram: string;
  whatsapp: string;
  roundPrize: string;
  isFounder: boolean;
}

export interface FlashQuestion {
  id: string;
  prompt: string;
  options: Choice[];
  status: string;
  closesAt: string;
  venueId: string | null;
  correctOption: string | null;
  total: number;
  byVenue: { venue: string | null; count: number }[];
}

interface OkResult {
  ok?: boolean;
  error?: string;
  awarded?: number;
  qrToken?: string;
  already?: boolean;
  void?: boolean;
}

async function ok<T extends OkResult>(result: T) {
  if (!result?.ok) throw new Error(result?.error || "No se pudo completar.");
  return result;
}

export function homeBoard() {
  return callRpc<HomeBoard>("pulse_home_board", { p_token: readSessionToken() });
}

export function matchBoard(matchId: string) {
  return callRpc<MatchBoard>("pulse_match_board", { p_token: readSessionToken(), p_match: matchId });
}

export async function answerLive(questionId: string, optionId: string) {
  return ok(await callRpc<OkResult>("pulse_live_answer", { p_token: readSessionToken(), p_question: questionId, p_option: optionId }));
}

export async function saveBingo(matchId: string, picks: string[]) {
  return ok(await callRpc<OkResult>("pulse_bingo_save", { p_token: readSessionToken(), p_match: matchId, p_picks: picks }));
}

export function visitQr(token: string) {
  return callRpc<QrVisit>("pulse_qr_visit", { p_token: readSessionToken(), p_qr: token });
}

export async function answerFlash(questionId: string, optionId: string) {
  return ok(await callRpc<OkResult>("pulse_flash_answer", { p_token: readSessionToken(), p_question: questionId, p_option: optionId }));
}

export function adminVenues(adminKey: string) {
  return callRpc<AdminVenue[]>("pulse_admin_venues", { p_admin_key: adminKey });
}

export async function rotateQr(adminKey: string, venueId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_rotate_qr", { p_admin_key: adminKey, p_venue_id: venueId }));
}

export async function setBroadcasts(adminKey: string, venueId: string, broadcasts: string) {
  return ok(await callRpc<OkResult>("pulse_admin_set_broadcasts", { p_admin_key: adminKey, p_venue_id: venueId, p_broadcasts: broadcasts }));
}

export async function createLive(input: { adminKey: string; matchId: string; kind: string; inning?: number; prompt?: string; labels?: string[]; closesAt?: string | null }) {
  return ok(await callRpc<OkResult>("pulse_admin_live_create", {
    p_admin_key: input.adminKey,
    p_match_id: input.matchId,
    p_kind: input.kind,
    p_inning: input.inning ?? null,
    p_prompt: input.prompt ?? "",
    p_labels: input.labels ?? [],
    p_closes_at: input.closesAt ?? null,
  }));
}

export async function closeLive(adminKey: string, questionId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_live_close", { p_admin_key: adminKey, p_question: questionId }));
}

export async function resolveLive(adminKey: string, questionId: string, optionId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_live_resolve", { p_admin_key: adminKey, p_question: questionId, p_option: optionId }));
}

export async function voidLive(adminKey: string, questionId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_live_void", { p_admin_key: adminKey, p_question: questionId }));
}

export function listLiveAdmin(adminKey: string) {
  return callRpc<LiveQuestion[]>("pulse_admin_live_list", { p_admin_key: adminKey });
}

export async function closeBingo(adminKey: string, matchId: string, occurred: string[]) {
  return ok(await callRpc<OkResult>("pulse_admin_bingo_close", { p_admin_key: adminKey, p_match: matchId, p_occurred: occurred }));
}

export async function createFlash(input: { adminKey: string; venueId: string; prompt: string; labels: string[]; minutes: number }) {
  return ok(await callRpc<OkResult>("pulse_admin_flash_create", {
    p_admin_key: input.adminKey,
    p_venue: input.venueId,
    p_prompt: input.prompt,
    p_labels: input.labels,
    p_minutes: input.minutes,
  }));
}

export async function resolveFlash(adminKey: string, questionId: string, optionId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_flash_resolve", { p_admin_key: adminKey, p_question: questionId, p_option: optionId }));
}

export async function voidFlash(adminKey: string, questionId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_flash_void", { p_admin_key: adminKey, p_question: questionId }));
}

export function listFlashAdmin(adminKey: string) {
  return callRpc<FlashQuestion[]>("pulse_admin_flash_list", { p_admin_key: adminKey });
}

export function mechanicsSummary(adminKey: string) {
  return callRpc<{ events: { type: string; count: number }[]; scans: { venue: string; count: number }[] }>("pulse_admin_mechanics_summary", { p_admin_key: adminKey });
}

export async function saveVenueDetails(input: { adminKey: string; venueId: string; zone: string; address: string; instagram: string; whatsapp: string; prize: string }) {
  return ok(await callRpc<OkResult>("pulse_admin_save_venue_details", {
    p_admin_key: input.adminKey,
    p_venue_id: input.venueId,
    p_zone: input.zone,
    p_address: input.address,
    p_instagram: input.instagram,
    p_whatsapp: input.whatsapp,
    p_prize: input.prize,
  }));
}

export async function activateLive(adminKey: string, questionId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_live_activate", { p_admin_key: adminKey, p_question: questionId }));
}

export async function activateFlash(adminKey: string, questionId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_flash_activate", { p_admin_key: adminKey, p_question: questionId }));
}
