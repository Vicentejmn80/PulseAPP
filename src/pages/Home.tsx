import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCoin, IconPin, IconTrophy } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { pointsToNextPosition } from "@/lib/leaderboard";
import { caracasDateKey, homeMatchTone, isActionableToday, pickActiveCycle } from "@/lib/toboHome";
import { callRpc } from "@/services/accountApi";
import {
  listCycles,
  listMatches,
  listRanking,
  listTascas,
  scoreLine,
  type BaseballMatch,
  type Tasca,
  type ToboCycle,
} from "@/services/matchesApi";
import { todayTrivia, type TriviaLevel, type TriviaQuestion } from "@/services/triviaApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";

const TRIVIA_ROWS: { level: TriviaLevel; label: string }[] = [
  { level: "beginner", label: "Básica" },
  { level: "intermediate", label: "Intermedia" },
  { level: "advanced", label: "Avanzada" },
];

function clockLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-VE", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Caracas",
  });
}

function rangeLabel(start: string, end: string) {
  const fmt = (value: string) => {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("es-VE", { day: "numeric", month: "short", timeZone: "America/Caracas" });
  };
  return `${fmt(start)} — ${fmt(end)}`;
}

function closesLabel(end: string) {
  const date = new Date(`${end}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const text = date.toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "America/Caracas",
  });
  return `Cierra el ${text}`;
}

function closesIn(startsAt: string, now: number) {
  const left = new Date(startsAt).getTime() - now;
  if (!Number.isFinite(left) || left <= 0) return "";
  const minutes = Math.floor(left / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `Pronóstico cierra en ${rest} min`;
  return `Pronóstico cierra en ${hours} h ${rest} min`;
}

function teamMark(name: string) {
  const skip = new Set(["de", "del", "la", "las", "los", "el"]);
  const word = name.split(/\s+/).find((part) => part && !skip.has(part.toLowerCase())) ?? name;
  return word.slice(0, 3).toUpperCase();
}

function GoldButton({ label, onClick, flush = false }: { label: string; onClick: () => void; flush?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${flush ? "" : "mt-3"} flex h-11 w-full items-center justify-center rounded-2xl text-[14px] font-extrabold tracking-wide`}
      style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
    >
      {label}
    </button>
  );
}

function GhostButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center justify-center rounded-2xl px-1 py-2 text-center text-[12px] font-extrabold leading-tight"
      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "white", border: "1px solid var(--t-border)" }}
    >
      {label}
    </button>
  );
}

function MatchCard({ match, now, onOpen }: { match: BaseballMatch; now: number; onOpen: () => void }) {
  const tone = homeMatchTone(match);
  const prediction = match.prediction;
  const official = tone === "finished" && match.homeScore !== null && match.awayScore !== null;

  return (
    <article
      className="rounded-[26px] px-4 py-4"
      style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)", boxShadow: "0 12px 28px rgba(0,0,0,0.28)" }}
    >
      <div className="flex items-center gap-3">
        <TeamSide name={match.awayTeam} />
        <span className="text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>vs</span>
        <TeamSide name={match.homeTeam} align="end" />
      </div>
      <p className="mt-3 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
        HOY · {clockLabel(match.startsAt)}
      </p>
      {(tone === "predict" || tone === "saved") && (
        <p className="mt-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{closesIn(match.startsAt, now)}</p>
      )}

      {tone === "predict" && (
        <>
          <p className="mt-3 text-[13px] font-extrabold">PRONOSTICA AHORA</p>
          <GoldButton label="PRONOSTICAR" onClick={onOpen} />
        </>
      )}
      {tone === "saved" && prediction && (
        <>
          <p className="mt-3 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>✓ PRONÓSTICO REGISTRADO</p>
          <p className="mt-1 text-[14px] font-extrabold">{scoreLine(match, prediction.homeScore, prediction.awayScore)}</p>
          <GoldButton label="EDITAR" onClick={onOpen} />
        </>
      )}
      {tone === "closed" && (
        <>
          <p className="mt-3 text-[13px] font-extrabold">🔒 PRONÓSTICOS CERRADOS</p>
          {prediction && <p className="mt-1 text-[14px] font-extrabold">{scoreLine(match, prediction.homeScore, prediction.awayScore)}</p>}
        </>
      )}
      {tone === "live" && (
        <>
          <p className="mt-3 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>EN VIVO</p>
          <GoldButton label="VER PARTIDO" onClick={onOpen} />
        </>
      )}
      {tone === "finished" && (
        <>
          <p className="mt-3 text-[13px] font-extrabold">FINALIZADO</p>
          {official && <p className="mt-1 text-[14px] font-extrabold">{scoreLine(match, match.homeScore ?? 0, match.awayScore ?? 0)}</p>}
        </>
      )}
      {tone === "cancelled" && <p className="mt-3 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>Cancelado</p>}
    </article>
  );
}

function TeamSide({ name, align = "start" }: { name: string; align?: "start" | "end" }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === "end" ? "flex-row-reverse text-right" : ""}`}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
        style={{ backgroundColor: "var(--t-tint)", color: "var(--t-accent)", border: "1px solid var(--t-border)" }}
      >
        {teamMark(name)}
      </span>
      <p className="min-w-0 text-[13px] font-extrabold leading-tight">{name}</p>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { totalPoints, reload } = usePulse();
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [cycle, setCycle] = useState<ToboCycle | null>(null);
  const [ranking, setRanking] = useState<LeaderboardEntry[]>([]);
  const [trivia, setTrivia] = useState<Record<TriviaLevel, TriviaQuestion[]>>({
    beginner: [],
    intermediate: [],
    advanced: [],
  });
  const [tascas, setTascas] = useState<Tasca[]>([]);
  const [qrPoints, setQrPoints] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    function load() {
      Promise.all([
        reload(),
        listMatches(),
        listCycles(),
        todayTrivia("beginner"),
        todayTrivia("intermediate"),
        todayTrivia("advanced"),
        listTascas(),
        callRpc<number>("pulse_cfg_int", { p_key: "QR_POINTS" }).catch(() => null),
      ])
        .then(async ([, matchRows, cycles, basic, mid, hard, venues, points]) => {
          if (!alive) return;
          const active = pickActiveCycle(cycles);
          const board = active ? await listRanking(active.id) : [];
          if (!alive) return;
          setMatches(matchRows);
          setCycle(active);
          setRanking(board);
          setTrivia({
            beginner: basic.questions,
            intermediate: mid.questions,
            advanced: hard.questions,
          });
          setTascas(venues);
          setQrPoints(typeof points === "number" ? points : Number(points) || null);
          setReady(true);
        })
        .catch((reason: unknown) => {
          if (!alive) return;
          setError(reason instanceof Error ? reason.message : "No se pudo cargar la jornada.");
          setReady(true);
        });
    }
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [reload]);

  const todayKey = caracasDateKey(now);
  const real = matches.filter((match) => !match.simulation && !match.demo);
  const today = real
    .filter((match) => caracasDateKey(match.startsAt) === todayKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const available = today.filter(isActionableToday).length;
  const mine = ranking.find((entry) => entry.isCurrentUser);
  const gap = mine ? pointsToNextPosition(ranking, mine.user.id) : null;
  const climb = !mine
    ? "Pronostica y entras al ranking."
    : mine.position <= 1
      ? "Vas primero en la ronda."
      : gap
        ? `Estás a ${formato(gap)} puntos del puesto #${mine.position - 1}.`
        : "Ver ranking";

  const triviaMax = TRIVIA_ROWS.reduce((sum, row) => sum + trivia[row.level].reduce((inner, question) => inner + question.points, 0), 0);
  const triviaPending = TRIVIA_ROWS.some((row) => {
    const questions = trivia[row.level];
    return questions.length > 0 && questions.some((question) => !question.answered);
  });
  const predictionsPending = today.some((match) => homeMatchTone(match) === "predict");
  const dayComplete = ready && today.length + triviaMax > 0 && !predictionsPending && !triviaPending;

  const spotlight = tascas.find((tasca) => tasca.isFounder) ?? tascas[0] ?? null;
  const prizeRows = tascas.filter((tasca) => tasca.roundPrize && tasca.roundPrize !== "Por confirmar").slice(0, 3);

  function openTrivia(level: TriviaLevel) {
    localStorage.setItem("tobo-trivia-level", level);
    navigate("/tobo/trivias");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-extrabold leading-none tracking-tight">Juégate el Tobo</h1>
          <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>Temporada LVBP 2026–27</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/tobo/profile")}
          className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3"
          style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
            <IconCoin className="h-4 w-4" />
          </span>
          <span className="text-[13px] font-extrabold tabular-nums">{formato(totalPoints)}</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && (
          <p className="mb-3 rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>
            {error}
          </p>
        )}

        <section
          className="rounded-[26px] px-4 py-4"
          style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
        >
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Ronda actual</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-extrabold leading-none">{cycle?.name ?? "Temporada"}</h2>
              {cycle && <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>{rangeLabel(cycle.startsOn, cycle.endsOn)}</p>}
              {cycle && <p className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{closesLabel(cycle.endsOn)}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[22px] font-extrabold tabular-nums leading-none" style={{ color: "var(--t-accent)" }}>{formato(mine?.points ?? 0)} <span className="text-[12px]">PT</span></p>
              <p className="mt-1 text-[16px] font-extrabold tabular-nums">#{mine?.position ?? "—"}</p>
            </div>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-extrabold tracking-tight">Juega hoy</h2>
              <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
                {!ready ? "Cargando juegos…" : available === 1 ? "1 juego disponible" : `${available} juegos disponibles`}
              </p>
            </div>
          </div>
          {!ready ? null : today.length === 0 ? (
            <div className="rounded-[26px] px-4 py-5" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
              <p className="text-[15px] font-extrabold">Hoy no hay juegos en el calendario.</p>
              <button type="button" onClick={() => navigate("/tobo/mi-quiniela")} className="mt-3 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
                Ver calendario completo →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {today.map((match) => (
                <MatchCard key={match.id} match={match} now={now} onOpen={() => navigate(`/tobo/partidos/${match.id}`)} />
              ))}
              <button type="button" onClick={() => navigate("/tobo/mi-quiniela")} className="py-1 text-left text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
                Ver calendario completo →
              </button>
            </div>
          )}
        </section>

        <section className="mt-5">
          <h2 className="text-[18px] font-extrabold tracking-tight">Trivia de hoy</h2>
          <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
            {triviaMax > 0 ? `Hasta ${formato(triviaMax)} puntos disponibles` : "Las trivias del día"}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {TRIVIA_ROWS.map((row) => {
              const questions = trivia[row.level];
              const answered = questions.filter((question) => question.answered).length;
              const max = questions.reduce((sum, question) => sum + question.points, 0);
              const done = questions.length > 0 && answered === questions.length;
              return (
                <article key={row.level} className="rounded-[22px] px-4 py-3" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-extrabold uppercase tracking-wide">{row.label}</p>
                      <p className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                        {questions.length === 0
                          ? "Hoy no hay preguntas de este nivel"
                          : `${questions.length} preguntas · hasta ${formato(max)} PT`}
                      </p>
                    </div>
                    {done && <span className="text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>✓ Completada</span>}
                  </div>
                  {questions.length > 0 && !done && (
                    <>
                      {answered > 0 && (
                        <p className="mt-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{answered}/{questions.length} respondidas</p>
                      )}
                      <GoldButton label="JUGAR AHORA" onClick={() => openTrivia(row.level)} />
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {dayComplete && (
          <section className="mt-4 rounded-[22px] px-4 py-4" style={{ backgroundColor: "var(--t-tint)", border: "1px solid var(--t-border)" }}>
            <p className="text-[15px] font-extrabold">Has completado tus actividades de hoy.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <GhostButton label="Ranking" onClick={() => navigate("/tobo/ranking")} />
              <GhostButton label="Tascas" onClick={() => navigate("/tobo/tascas")} />
              <GhostButton label="Calendario" onClick={() => navigate("/tobo/mi-quiniela")} />
            </div>
          </section>
        )}

        <section className="mt-5 rounded-[22px] px-4 py-3" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>Tu ronda</p>
              <p className="mt-1 text-[14px] font-extrabold">{climb}</p>
            </div>
          </div>
          <GoldButton label="VER RANKING" onClick={() => navigate("/tobo/ranking")} />
        </section>

        <section className="mt-4 overflow-hidden rounded-[22px]" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <div
            className="flex h-[72px] items-end px-4 pb-3"
            style={{
              background: spotlight?.imageUrl
                ? `linear-gradient(to top, rgba(7,14,31,0.82), rgba(7,14,31,0.15)), url(${spotlight.imageUrl}) center/cover`
                : "linear-gradient(135deg, #1E3A6E 0%, #0B1A3C 70%)",
            }}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">Suma puntos en una tasca</p>
          </div>
          <div className="px-4 py-3">
            <p className="flex items-center gap-1.5 text-[15px] font-extrabold">
              <IconPin className="h-4 w-4" />
              {spotlight?.name ?? "Tasca participante"}
            </p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
              Visita una tasca participante y escanea el QR.
            </p>
            {qrPoints != null && qrPoints > 0 && (
              <p className="mt-2 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>+{formato(qrPoints)} PT HOY</p>
            )}
            <GoldButton label="VER TASCAS" onClick={() => navigate("/tobo/tascas")} />
          </div>
        </section>

        <section className="mt-4 rounded-[22px] px-4 py-3" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>
            <IconTrophy className="h-4 w-4" />
            Premios de esta ronda
          </p>
          <p className="mt-2 text-[15px] font-extrabold">
            {prizeRows.length > 0 ? `${prizeRows.length} premios en juego` : "Hay premios que todavía puedes ganar."}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {prizeRows.map((tasca, index) => (
              <div key={tasca.id} className="flex items-start gap-2">
                <span className="text-[12px] font-extrabold tabular-nums" style={{ color: "var(--t-accent)" }}>#{index + 1}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-extrabold leading-tight">{tasca.roundPrize}</p>
                  <p className="text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{tasca.name}</p>
                </div>
              </div>
            ))}
          </div>
          <GoldButton label="VER PREMIOS" onClick={() => navigate("/tobo/premios")} />
        </section>

        <section className="mt-4 rounded-[22px] px-4 py-3" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>Juega con los tuyos</p>
          <p className="mt-1 text-[14px] font-extrabold">Crea una liga privada y compite con tus amigos.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <GoldButton flush label="CREAR LIGA" onClick={() => navigate("/tobo/ligas?tab=crear")} />
            <GhostButton label="UNIRME" onClick={() => navigate("/tobo/ligas?tab=unirme")} />
          </div>
        </section>
      </div>
      <TabBar />
    </div>
  );
}
