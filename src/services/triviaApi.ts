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

/** Devuelve las 2 preguntas del día (mismo par para todos los usuarios). */
export async function todayTrivia() {
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

export async function answerTrivia(questionId: string, optionId: string): Promise<TriviaResult> {
  const result = await callRpc<OkResult & TriviaResult>("pulse_trivia_answer", {
    p_token: readSessionToken(),
    p_question_id: questionId,
    p_option_id: optionId,
  });
  expectOk(result);
  return {
    correct: Boolean(result.correct),
    points: Number(result.points ?? 0),
    correctOption: String(result.correctOption ?? ""),
    explanation: result.explanation ? String(result.explanation) : undefined,
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
