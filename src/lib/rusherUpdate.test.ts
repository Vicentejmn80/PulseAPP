import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { awardedTriviaPoints, triviaPointsForDifficulty } from "@/lib/triviaPoints";
import { selectIniciadoQuestions, type RotationQuestion } from "@/lib/triviaRotation";

interface BankQuestion {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correctOption: string;
  difficulty: string;
  points: number;
}

interface ScheduleGame {
  date: string;
  awayTeam: string | null;
  homeTeam: string | null;
  clock: string | null;
  action: string;
  id: string | null;
  startsAt?: string;
}

const bank = JSON.parse(readFileSync(new URL("../data/triviaIniciado.json", import.meta.url), "utf8")) as {
  receivedRows: number;
  incorporated: number;
  exactDuplicatesRemoved: number;
  questions: BankQuestion[];
  review: { code: string }[];
};

const schedule = JSON.parse(readFileSync(new URL("../data/lvbpSchedule.json", import.meta.url), "utf8")) as {
  parsed: number;
  counts: Record<string, number>;
  games: ScheduleGame[];
};

const TEAMS = [
  "Tiburones de La Guaira",
  "Navegantes del Magallanes",
  "Tigres de Aragua",
  "Caribes de Anzoátegui",
  "Leones del Caracas",
  "Águilas del Zulia",
  "Bravos de Margarita",
  "Cardenales de Lara",
];

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

describe("puntuación de trivia", () => {
  it("otorga 2, 4 y 6 y cero si la respuesta es incorrecta", () => {
    expect(awardedTriviaPoints("easy", true)).toBe(2);
    expect(awardedTriviaPoints("beginner", true)).toBe(2);
    expect(awardedTriviaPoints("iniciado", true)).toBe(2);
    expect(awardedTriviaPoints("medium", true)).toBe(4);
    expect(awardedTriviaPoints("intermediate", true)).toBe(4);
    expect(awardedTriviaPoints("hard", true)).toBe(6);
    expect(awardedTriviaPoints("advanced", true)).toBe(6);
    expect(awardedTriviaPoints("easy", false)).toBe(0);
    expect(awardedTriviaPoints("medium", false)).toBe(0);
    expect(awardedTriviaPoints("hard", false)).toBe(0);
    expect(triviaPointsForDifficulty("otro")).toBe(0);
  });
});

describe("banco Iniciado", () => {
  it("incorpora el banco sin duplicados exactos y con la opción correcta", () => {
    expect(bank.receivedRows).toBe(90);
    expect(bank.incorporated).toBe(bank.questions.length);
    expect(bank.questions.length).toBe(60);
    expect(bank.exactDuplicatesRemoved).toBe(30);
    const prompts = bank.questions.map((question) => fold(question.prompt));
    expect(new Set(prompts).size).toBe(prompts.length);
    const ids = bank.questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const question of bank.questions) {
      expect(question.difficulty).toBe("easy");
      expect(question.points).toBe(2);
      expect(question.options.map((option) => option.id)).toEqual(["a", "b", "c", "d"]);
      expect(question.options.every((option) => option.label.length > 0)).toBe(true);
      expect(question.options.some((option) => option.id === question.correctOption)).toBe(true);
    }
    const keptSimilar = bank.questions.find((question) => question.id === "trv_ini_p072");
    expect(keptSimilar?.correctOption).toBe("a");
    expect(bank.review.map((item) => item.code)).toContain("P072");
  });
});

describe("rotación diaria de Iniciado", () => {
  const pool: RotationQuestion[] = Array.from({ length: 12 }, (_, index) => ({
    id: `q${index + 1}`,
    lastSeen: null,
  }));

  it("mantiene la misma selección durante el día y no repite dentro de la sesión", () => {
    const first = selectIniciadoQuestions(pool, "user-a", "2026-10-12");
    const second = selectIniciadoQuestions(pool, "user-a", "2026-10-12");
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(4);
  });

  it("puede cambiar al día siguiente y no es igual para todos los usuarios", () => {
    const today = selectIniciadoQuestions(pool, "user-a", "2026-10-12");
    const tomorrow = selectIniciadoQuestions(pool, "user-a", "2026-10-13");
    const otherUser = selectIniciadoQuestions(pool, "user-b", "2026-10-12");
    expect(tomorrow.join()).not.toBe(today.join());
    expect(otherUser.join()).not.toBe(today.join());
  });

  it("prioriza las no vistas y, si ya se vieron, las más antiguas", () => {
    const mixed: RotationQuestion[] = [
      { id: "seen-new", lastSeen: "2026-10-11T20:00:00Z" },
      { id: "unseen-b", lastSeen: null },
      { id: "seen-old", lastSeen: "2026-10-01T20:00:00Z" },
      { id: "unseen-a", lastSeen: null },
    ];
    const picked = selectIniciadoQuestions(mixed, "user-a", "2026-10-12", 2);
    expect(picked.every((id) => id.startsWith("unseen"))).toBe(true);

    const seen: RotationQuestion[] = [
      { id: "d", lastSeen: "2026-10-10T00:00:00Z" },
      { id: "a", lastSeen: "2026-10-01T00:00:00Z" },
      { id: "c", lastSeen: "2026-10-08T00:00:00Z" },
      { id: "b", lastSeen: "2026-10-04T00:00:00Z" },
      { id: "e", lastSeen: "2026-10-12T00:00:00Z" },
    ];
    expect(selectIniciadoQuestions(seen, "user-a", "2026-10-12")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("cronograma LVBP", () => {
  it("cubre 80 juegos sin duplicar el enfrentamiento del día", () => {
    expect(schedule.parsed).toBe(80);
    expect(schedule.games).toHaveLength(80);
    expect(schedule.counts).toEqual({
      unchanged: 44,
      update_home_away: 1,
      kept_unconfirmed_time: 19,
      omitted_no_time: 4,
      insert: 12,
    });
    const keys = schedule.games
      .filter((game) => game.action !== "duplicate")
      .map((game) => `${game.date}|${game.awayTeam}|${game.homeTeam}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const game of schedule.games) {
      expect(TEAMS).toContain(game.awayTeam);
      expect(TEAMS).toContain(game.homeTeam);
      expect(game.awayTeam).not.toBe(game.homeTeam);
    }
    const opening = schedule.games.find((game) => game.date === "2026-10-12");
    expect(opening?.awayTeam).toBe("Tiburones de La Guaira");
    expect(opening?.homeTeam).toBe("Navegantes del Magallanes");
    expect(opening?.clock).toBe("19:00");
    expect(opening?.action).toBe("unchanged");
    const swapped = schedule.games.find((game) => game.action === "update_home_away");
    expect(swapped?.id).toBe("lvbp_20261016_1900_mag_tig");
    expect(swapped?.homeTeam).toBe("Navegantes del Magallanes");
    const saturday = schedule.games.find(
      (game) => game.date === "2026-10-31" && game.awayTeam === "Tiburones de La Guaira",
    );
    expect(saturday?.clock).toBe("18:00");
    expect(schedule.games.filter((game) => game.action === "omitted_no_time").every((game) => game.date === "2026-11-01")).toBe(true);
    expect(schedule.games.filter((game) => game.action === "insert").every((game) => game.clock === "19:00" && game.startsAt?.endsWith("-04"))).toBe(true);
  });
});
