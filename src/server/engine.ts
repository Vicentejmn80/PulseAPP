import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GAMES, MISSIONS, SEED_TRANSACTIONS, USERS } from "@/data/mock/catalog";
import type { CloudFile, CloudProfile } from "@/server/engineTypes";
import { loadRemoteStore, saveRemoteStore, useRemoteStore } from "@/server/storageStore";
import { createId } from "@/lib/format";
import { isGamePlayable } from "@/lib/games";
import { getMissionProgress } from "@/lib/missions";
import type { Game, Participation, PointsTransaction, UserProfile } from "@/types/pulse";

export type { CloudFile, CloudProfile } from "@/server/engineTypes";

const COLORS = ["#FF5A78", "#FF8A3D", "#5C4DDB", "#1F9D62", "#E0A106", "#241710"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const EMPTY: CloudFile = {
  profiles: [],
  sessions: [],
  participations: [],
  transactions: [],
  completedMissionIds: {},
  predictionPicks: {},
  extraGames: [],
};

function storePath() {
  return path.resolve(process.cwd(), "data", "pulse-cloud.json");
}

function loadLocal(): CloudFile {
  try {
    const raw = JSON.parse(readFileSync(storePath(), "utf8")) as Partial<CloudFile>;
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

function saveLocal(file: CloudFile) {
  const target = storePath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(file, null, 2));
}

async function readStore() {
  if (useRemoteStore()) return loadRemoteStore();
  return loadLocal();
}

async function writeStore(file: CloudFile) {
  if (useRemoteStore()) {
    await saveRemoteStore(file);
    return;
  }
  saveLocal(file);
}

export function normalizePhone(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `58${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("4")) digits = `58${digits}`;
  if (!/^58\d{10}$/.test(digits)) return "";
  return `+${digits}`;
}

function accessCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

function initialsFrom(alias: string) {
  const parts = alias.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "P") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "");
  return letters.toUpperCase();
}

function handleFrom(alias: string, profiles: CloudProfile[]) {
  const base = alias
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16) || "jugador";
  let handle = `@${base}`;
  let n = 2;
  const taken = new Set(profiles.map((profile) => profile.handle));
  while (taken.has(handle)) {
    handle = `@${base}${n}`;
    n += 1;
  }
  return handle;
}

function publicUser(profile: CloudProfile | UserProfile): UserProfile {
  return {
    id: profile.id,
    alias: profile.alias,
    handle: profile.handle,
    initials: profile.initials,
    avatarColor: profile.avatarColor,
  };
}

function gamesOf(file: CloudFile) {
  return [...file.extraGames, ...GAMES];
}

function snapshot(file: CloudFile, userId: string) {
  const mine = file.profiles.find((profile) => profile.id === userId);
  if (!mine) return null;
  const users = [...USERS.map(publicUser), ...file.profiles.map(publicUser)];
  return {
    currentUser: mine,
    users,
    participations: file.participations.filter((item) => item.userId === userId),
    transactions: [...SEED_TRANSACTIONS, ...file.transactions],
    completedMissionIds: file.completedMissionIds[userId] ?? [],
    predictionPicks: file.predictionPicks[userId] ?? {},
    extraGames: file.extraGames,
  };
}

function sessionUser(file: CloudFile, token: string) {
  const session = file.sessions.find((item) => item.token === token);
  if (!session) return null;
  return file.profiles.find((profile) => profile.id === session.userId) ?? null;
}

function awardMissions(file: CloudFile, userId: string, experienceId: string) {
  const completed = new Set(file.completedMissionIds[userId] ?? []);
  const mine = file.participations.filter((item) => item.userId === userId && item.experienceId === experienceId);
  const created: PointsTransaction[] = [];
  for (const mission of MISSIONS.filter((item) => item.experienceId === experienceId)) {
    if (completed.has(mission.id)) continue;
    if (!getMissionProgress(mission, mine).completed) continue;
    completed.add(mission.id);
    created.push({
      id: createId("tx"),
      userId,
      experienceId,
      sourceType: "mission",
      sourceId: mission.id,
      points: mission.points,
      createdAt: new Date().toISOString(),
    });
  }
  file.completedMissionIds[userId] = [...completed];
  file.transactions.push(...created);
  return created.reduce((sum, tx) => sum + tx.points, 0);
}

function runPulse(file: CloudFile, body: Record<string, unknown>) {
  const action = String(body.action ?? "");

  if (action === "register") {
    const phone = normalizePhone(String(body.phone ?? ""));
    const alias = String(body.alias ?? "").trim().replace(/\s+/g, " ");
    if (!phone) return { ok: false as const, error: "Escribe un celular de Venezuela, por ejemplo 0412 000 0000." };
    if (alias.length < 2 || alias.length > 24) return { ok: false as const, error: "El alias público necesita entre 2 y 24 caracteres." };
    if (file.profiles.some((profile) => profile.phone === phone)) {
      return { ok: false as const, error: "Ese número ya tiene perfil. Entra con tu clave." };
    }
    const profile: CloudProfile = {
      id: createId("user"),
      phone,
      alias,
      handle: handleFrom(alias, file.profiles),
      initials: initialsFrom(alias),
      avatarColor: COLORS[file.profiles.length % COLORS.length],
      accessCode: accessCode(),
    };
    const token = createId("sess");
    file.profiles.push(profile);
    file.sessions.push({ token, userId: profile.id });
    return { ok: true as const, token, ...snapshot(file, profile.id)!, persist: true };
  }

  if (action === "login") {
    const phone = normalizePhone(String(body.phone ?? ""));
    const code = String(body.accessCode ?? "").trim().toUpperCase();
    const profile = file.profiles.find((item) => item.phone === phone && item.accessCode === code);
    if (!profile) return { ok: false as const, error: "No coincide el número y la clave." };
    const token = createId("sess");
    file.sessions.push({ token, userId: profile.id });
    return { ok: true as const, token, ...snapshot(file, profile.id)!, persist: true };
  }

  if (action === "load") {
    const profile = sessionUser(file, String(body.token ?? ""));
    if (!profile) return { ok: false as const, error: "La sesión expiró. Entra de nuevo." };
    return { ok: true as const, ...snapshot(file, profile.id)!, persist: false };
  }

  if (action === "complete") {
    const profile = sessionUser(file, String(body.token ?? ""));
    if (!profile) return { ok: false as const, error: "La sesión expiró. Entra de nuevo." };
    const game = gamesOf(file).find((item) => item.id === String(body.gameId ?? ""));
    if (!game || !isGamePlayable(game)) return { ok: false as const, error: "Esta actividad no está abierta." };
    const already = file.participations.some((item) => item.userId === profile.id && item.gameId === game.id);
    if (already) return { ok: true as const, awarded: 0, ...snapshot(file, profile.id)!, persist: false };

    let points = 0;
    let metadata: Participation["metadata"];
    let optionId = "";

    if (game.configuration.kind === "prediction") {
      optionId = String(body.optionId ?? "");
      const option = game.configuration.options.find((item) => item.id === optionId);
      if (!option) return { ok: false as const, error: "Elige una opción." };
      points = game.points;
      metadata = { optionId };
    } else if (game.configuration.kind === "trivia") {
      const answers = Array.isArray(body.answers) ? body.answers.map((value) => Number(value)) : [];
      if (answers.length !== game.configuration.questions.length) return { ok: false as const, error: "Faltan respuestas." };
      let correct = 0;
      game.configuration.questions.forEach((question, index) => {
        if (answers[index] === question.correctAnswer) {
          correct += 1;
          points += question.points;
        }
      });
      metadata = { questionsAnswered: answers.length, correct };
    } else {
      const picked = Number(body.answer);
      if (picked !== game.configuration.correctAnswer) {
        return { ok: true as const, awarded: 0, ...snapshot(file, profile.id)!, persist: false };
      }
      points = game.configuration.points;
      metadata = { correct: 1 };
    }

    file.participations.push({
      id: createId("part"),
      userId: profile.id,
      experienceId: game.experienceId,
      gameId: game.id,
      type: game.type,
      createdAt: new Date().toISOString(),
      metadata,
    });
    if (points > 0) {
      file.transactions.push({
        id: createId("tx"),
        userId: profile.id,
        experienceId: game.experienceId,
        sourceType: game.type,
        sourceId: game.id,
        points,
        createdAt: new Date().toISOString(),
      });
    }
    if (optionId) {
      file.predictionPicks[profile.id] = { ...(file.predictionPicks[profile.id] ?? {}), [game.id]: optionId };
    }
    const missionPoints = awardMissions(file, profile.id, game.experienceId);
    return {
      ok: true as const,
      awarded: points + missionPoints,
      gamePoints: points,
      ...snapshot(file, profile.id)!,
      persist: true,
    };
  }

  if (action === "addGame") {
    const profile = sessionUser(file, String(body.token ?? ""));
    if (!profile) return { ok: false as const, error: "La sesión expiró. Entra de nuevo." };
    const game = body.game as Game;
    if (!game?.id || !game.experienceId) return { ok: false as const, error: "El juego está incompleto." };
    file.extraGames = [game, ...file.extraGames.filter((item) => item.id !== game.id)];
    return { ok: true as const, ...snapshot(file, profile.id)!, persist: true };
  }

  return { ok: false as const, error: "Acción desconocida." };
}

export async function handlePulse(body: Record<string, unknown>) {
  const file = await readStore();
  const result = runPulse(file, body);
  if ("persist" in result && result.persist) await writeStore(file);
  const { persist: _persist, ...response } = result as typeof result & { persist?: boolean };
  return response;
}
