import { callRpc, readSessionToken } from "@/services/accountApi";

export interface TriviaOption {
  id: string;
  label: string;
}

export interface TriviaQuestion {
  id: string;
  prompt: string;
  options: TriviaOption[];
  category: string;
  difficulty: string;
  points: number;
  publishDate: string;
  answered: boolean;
}

export interface TriviaResult {
  correct: boolean;
  points: number;
  correctOption: string;
  explanation?: string;
}

export interface TriviaAdminQuestion {
  id: string;
  prompt: string;
  options: TriviaOption[];
  correctOption: string;
  explanation?: string;
  category: string;
  difficulty: string;
  status: "draft" | "active" | "disabled";
  publishDate: string | null;
  points: number;
}

interface OkResult {
  ok?: boolean;
  error?: string;
  question?: unknown;
  questions?: unknown;
}

function expectOk<T extends OkResult>(result: T) {
  if (!result?.ok) throw new Error(result?.error || "No se pudo completar.");
  return result;
}

function asOptions(value: unknown): TriviaOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((opt) => ({
    id: String((opt as Record<string, unknown>).id ?? ""),
    label: String((opt as Record<string, unknown>).label ?? ""),
  }));
}

function asQuestion(value: unknown): TriviaQuestion | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    prompt: String(row.prompt ?? ""),
    options: asOptions(row.options),
    category: String(row.category ?? ""),
    difficulty: String(row.difficulty ?? ""),
    points: Number(row.points ?? 0),
    publishDate: String(row.publishDate ?? ""),
    answered: Boolean(row.answered),
  };
}

export type TriviaLevel = "beginner" | "intermediate" | "advanced";

export type TriviaAvailability = "available" | "in_progress" | "cooldown";

export interface TriviaLevelState {
  level: TriviaLevel;
  difficulty: string;
  status: TriviaAvailability;
  sessionId: string | null;
  questionCount: number;
  answeredCount: number;
  availableAt: string | null;
  serverNow: string;
}

export interface TriviaBoard {
  serverNow: string;
  levels: TriviaLevelState[];
}

export interface TriviaSession {
  sessionId: string;
  questions: TriviaQuestion[];
  serverNow: string;
  availableAt: string | null;
}

const ANSWER_SECONDS = 15;

export { ANSWER_SECONDS };

/** Reloj del servidor menos el reloj del dispositivo. La elegibilidad no usa este valor. */
export function serverSkewMs(serverNow: string, clientNow = Date.now()) {
  const server = Date.parse(serverNow);
  if (Number.isNaN(server)) return 0;
  return server - clientNow;
}

export function remainingMs(availableAt: string | null, skewMs: number, clientNow = Date.now()) {
  if (!availableAt) return 0;
  const at = Date.parse(availableAt);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, at - (clientNow + skewMs));
}

export function formatCooldown(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `Vuelve en ${rest} min`;
  return `Vuelve en ${hours} h ${rest} min`;
}

function asLevel(value: unknown): TriviaLevelState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const level = String(row.level ?? "");
  if (level !== "beginner" && level !== "intermediate" && level !== "advanced") return null;
  const status = String(row.status ?? "available");
  return {
    level,
    difficulty: String(row.difficulty ?? ""),
    status: status === "cooldown" || status === "in_progress" ? status : "available",
    sessionId: row.sessionId ? String(row.sessionId) : null,
    questionCount: Number(row.questionCount ?? 0),
    answeredCount: Number(row.answeredCount ?? 0),
    availableAt: row.availableAt ? String(row.availableAt) : null,
    serverNow: String(row.serverNow ?? ""),
  };
}

export async function triviaStatus() {
  const result = await callRpc<OkResult & { serverNow?: string; levels?: unknown }>("pulse_trivia_status", {
    p_token: readSessionToken(),
  });
  if (!result?.ok) throw new Error(result?.error || "No se pudo consultar las trivias.");
  const levels = (Array.isArray(result.levels) ? result.levels : []).map(asLevel).filter(Boolean) as TriviaLevelState[];
  return { serverNow: String(result.serverNow ?? ""), levels };
}

export async function startTrivia(level: TriviaLevel): Promise<TriviaSession> {
  const result = await callRpc<OkResult & { code?: string; sessionId?: string; questions?: unknown; serverNow?: string; availableAt?: string }>(
    "pulse_trivia_start",
    { p_token: readSessionToken(), p_level: level },
  );
  if (!result?.ok) {
    const error = new Error(result?.error || "No se pudo iniciar la trivia.") as Error & { code?: string; availableAt?: string; serverNow?: string };
    error.code = result?.code;
    error.availableAt = result?.availableAt ? String(result.availableAt) : undefined;
    error.serverNow = result?.serverNow ? String(result.serverNow) : undefined;
    throw error;
  }
  const questions = (Array.isArray(result.questions) ? result.questions : []).map(asQuestion).filter(Boolean) as TriviaQuestion[];
  return {
    sessionId: String(result.sessionId ?? ""),
    questions,
    serverNow: String(result.serverNow ?? ""),
    availableAt: result.availableAt ? String(result.availableAt) : null,
  };
}

/** Devuelve las preguntas publicadas hoy. */
export async function todayTrivia(level: TriviaLevel = "beginner") {
  void level;
  const result = await callRpc<OkResult & { questions?: unknown; message?: string }>(
    "pulse_trivia_today",
    { p_token: readSessionToken() },
  );
  if (!result?.ok) throw new Error(result?.error || "No se pudo cargar la trivia.");

  const rawList = Array.isArray(result.questions) ? result.questions : [];
  const questions = rawList.map(asQuestion).filter(Boolean) as TriviaQuestion[];
  return {
    questions,
    message: result.message,
    /** Cuántas han sido respondidas hoy */
    answeredCount: questions.filter((q) => q.answered).length,
  };
}

export async function answerTrivia(sessionId: string, questionId: string, optionId: string): Promise<TriviaResult & { replayed: boolean; completed: boolean; availableAt: string | null; serverNow: string }> {
  const result = await callRpc<OkResult & TriviaResult & { replayed?: boolean; completed?: boolean; availableAt?: string; serverNow?: string; code?: string }>(
    "pulse_trivia_answer",
    {
      p_token: readSessionToken(),
      p_question_id: questionId,
      p_option_id: optionId,
      p_session_id: sessionId,
    },
  );
  if (!result?.ok) {
    const error = new Error(result?.error || "No se pudo responder.") as Error & { code?: string };
    error.code = result?.code;
    throw error;
  }
  return {
    correct: Boolean(result.correct),
    points: Number(result.points ?? 0),
    correctOption: String(result.correctOption ?? ""),
    explanation: result.explanation ? String(result.explanation) : undefined,
    replayed: Boolean(result.replayed),
    completed: Boolean(result.completed),
    availableAt: result.availableAt ? String(result.availableAt) : null,
    serverNow: String(result.serverNow ?? ""),
  };
}

export async function listTriviaAdmin(adminKey: string) {
  const result = await callRpc<OkResult & { questions?: unknown }>("pulse_trivia_admin_list", {
    p_admin_key: adminKey,
  });
  expectOk(result);
  const rows = Array.isArray(result.questions) ? result.questions : [];
  return rows.map((row) => {
    const q = row as Record<string, unknown>;
    return {
      id: String(q.id ?? ""),
      prompt: String(q.prompt ?? ""),
      options: asOptions(q.options),
      correctOption: String(q.correctOption ?? ""),
      explanation: q.explanation ? String(q.explanation) : undefined,
      category: String(q.category ?? ""),
      difficulty: String(q.difficulty ?? ""),
      status: String(q.status ?? "draft") as TriviaAdminQuestion["status"],
      publishDate: q.publishDate ? String(q.publishDate) : null,
      points: Number(q.points ?? 0),
    } as TriviaAdminQuestion;
  });
}

export async function saveTriviaAdmin(
  adminKey: string,
  input: {
    id?: string;
    prompt: string;
    options: TriviaOption[];
    correctOption: string;
    explanation?: string;
    category: string;
    difficulty: string;
    status: TriviaAdminQuestion["status"];
    publishDate: string | null;
    points: number;
  },
) {
  const result = await callRpc<OkResult & { id?: string }>("pulse_trivia_admin_save", {
    p_admin_key: adminKey,
    p_id: input.id ?? null,
    p_prompt: input.prompt,
    p_options: input.options,
    p_correct_option: input.correctOption,
    p_explanation: input.explanation ?? null,
    p_category: input.category,
    p_difficulty: input.difficulty,
    p_status: input.status,
    p_publish_date: input.publishDate ?? null,
    p_points: input.points,
  });
  return expectOk(result);
}

export async function setTriviaStatusAdmin(
  adminKey: string,
  questionId: string,
  status: TriviaAdminQuestion["status"],
) {
  const result = await callRpc<OkResult>("pulse_trivia_admin_set_status", {
    p_admin_key: adminKey,
    p_question_id: questionId,
    p_status: status,
  });
  return expectOk(result);
}
