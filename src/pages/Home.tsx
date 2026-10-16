import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CircleDot,
  CalendarDays,
  Check,
  Clock,
  Hand,
  Lock,
  Pencil,
  Play,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { CardHead, GhostCta, GoldCta, IconChip, StatCell, ToboCard } from "@/components/tobo/surface";
import { IconCoin } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { pointsToNextPosition } from "@/lib/leaderboard";
import { caracasDateKey, cycleClosesLabel, cycleContainingToday, cycleSpanLabel, homeMatchTone, pickActiveCycle } from "@/lib/toboHome";
import {
  LVBP_EXPERIENCE_TITLE,
  LVBP_SEASON_LABEL,
  LVBP_WELCOME_BODY,
  LVBP_WELCOME_HEADLINE,
} from "@/config/lvbpBrand";
import { TOBO_ROUND_PRIZE_SUBTITLE } from "@/config/tobo";
import { recentFinishedWithPrediction } from "@/lib/predictions/visibility";
import { listCycles, listMatches, loadCycleBoard, scoreLine, type BaseballMatch, type ToboCycle } from "@/services/matchesApi";
import { FounderBanner } from "@/components/tobo/FounderBanner";
import { triviaPointsForDifficulty } from "@/lib/triviaPoints";
import { formatCooldown, remainingMs, serverSkewMs, triviaStatus, type TriviaLevel, type TriviaLevelState } from "@/services/triviaApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";
import type { LucideIcon } from "lucide-react";

const TRIVIA_ROWS: { level: TriviaLevel; label: string; icon: LucideIcon; color: string }[] = [
  { level: "beginner", label: "Iniciado", icon: CircleDot, color: "#22C55E" },
  { level: "intermediate", label: "Intermedio", icon: Hand, color: "#60A5FA" },
  { level: "advanced", label: "Avanzado", icon: Zap, color: "#C084FC" },
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

function dayLabel(startsAt: string, now: number) {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "PRÓXIMO";
  const todayKey = caracasDateKey(now);
  const matchKey = caracasDateKey(d);
  if (matchKey === todayKey) return "HOY";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (matchKey === caracasDateKey(tomorrow)) return "MAÑANA";
  const text = d.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Caracas" });
  return text.toUpperCase();
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

function MatchCard({ match, now, onOpen }: { match: BaseballMatch; now: number; onOpen: () => void }) {
  const tone = homeMatchTone(match);
  const prediction = match.prediction;
  const official = tone === "finished" && match.homeScore !== null && match.awayScore !== null;

  return (
    <article className="rounded-[18px] p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid var(--t-border)" }}>
      <div className="flex items-center gap-3">
        <TeamSide name={match.awayTeam} />
        <span className="text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>vs</span>
        <TeamSide name={match.homeTeam} align="end" />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
        <Clock className="h-3.5 w-3.5" />
        {dayLabel(match.startsAt, now)} · {clockLabel(match.startsAt)}
      </p>
      {(tone === "predict" || tone === "saved") && (
        <p className="mt-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{closesIn(match.startsAt, now)}</p>
      )}

      {tone === "predict" && (
        <div className="mt-3">
          <p className="mb-2 text-[13px] font-extrabold">Pronostica ahora</p>
          <GoldCta icon={Play} onClick={onOpen}>Pronosticar</GoldCta>
        </div>
      )}
      {tone === "saved" && prediction && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
            <Check className="h-4 w-4" /> Pronóstico registrado
          </p>
          <p className="mt-1 text-[14px] font-extrabold">{scoreLine(match, prediction.homeScore, prediction.awayScore)}</p>
          <div className="mt-3">
            <GoldCta icon={Pencil} onClick={onOpen}>Editar</GoldCta>
          </div>
        </div>
      )}
      {tone === "closed" && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>
            <Lock className="h-4 w-4" /> Pronósticos cerrados
          </p>
          {prediction && <p className="mt-1 text-[14px] font-extrabold">{scoreLine(match, prediction.homeScore, prediction.awayScore)}</p>}
        </div>
      )}
      {tone === "live" && (
        <div className="mt-3">
          <p className="text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>En vivo</p>
          <div className="mt-3">
            <GoldCta icon={Play} onClick={onOpen}>Ver partido</GoldCta>
          </div>
        </div>
      )}
      {tone === "finished" && (
        <div className="mt-3">
          <p className="text-[13px] font-extrabold">Finalizado</p>
          {official && <p className="mt-1 text-[14px] font-extrabold">{scoreLine(match, match.homeScore ?? 0, match.awayScore ?? 0)}</p>}
          {prediction && (
            <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
              Tu pronóstico: {scoreLine(match, prediction.homeScore, prediction.awayScore)}
            </p>
          )}
          {prediction?.processed && prediction.total !== null ? (
            <p className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>+{prediction.total} PT</p>
          ) : prediction ? (
            <p className="mt-1 text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>⏳ Pendiente de liquidación</p>
          ) : null}
        </div>
      )}
      {tone === "cancelled" && <p className="mt-3 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>Cancelado</p>}
    </article>
  );
}

function TeamSide({ name, align = "start" }: { name: string; align?: "start" | "end" }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === "end" ? "flex-row-reverse text-right" : ""}`}>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
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
  const { reload } = usePulse();
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [cycle, setCycle] = useState<ToboCycle | null>(null);
  const [ranking, setRanking] = useState<LeaderboardEntry[]>([]);
  const [roundPoints, setRoundPoints] = useState(0);
  const [pointsAreRound, setPointsAreRound] = useState(false);
  const [trivia, setTrivia] = useState<TriviaLevelState[]>([]);
  const [triviaSkew, setTriviaSkew] = useState(0);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [moreOpen, setMoreOpen] = useState(false);

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
        triviaStatus(),
      ])
        .then(async ([, matchRows, cycles, boardTrivia]) => {
          if (!alive) return;
          const active = pickActiveCycle(cycles);
          const live = cycleContainingToday(cycles);
          const board = await loadCycleBoard(live?.id ?? "lifetime");
          if (!alive) return;
          setMatches(matchRows);
          setCycle(active);
          setRanking(board.entries);
          setRoundPoints(board.points);
          setPointsAreRound(Boolean(live));
          setTrivia(boardTrivia.levels);
          setTriviaSkew(serverSkewMs(boardTrivia.serverNow));
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
  const stillOpen = (match: BaseballMatch) => {
    const tone = homeMatchTone(match);
    return tone === "predict" || tone === "saved";
  };
  const upcoming = real
    .filter(stillOpen)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const gamesToShow = today.filter(stillOpen);
  const nextMatch = upcoming.find((match) => caracasDateKey(match.startsAt) !== todayKey) ?? null;
  const shownIds = new Set(gamesToShow.length > 0 ? gamesToShow.map((match) => match.id) : nextMatch ? [nextMatch.id] : []);
  const moreGames = upcoming
    .filter((match) => !shownIds.has(match.id))
    .filter((match) => {
      const tone = homeMatchTone(match);
      return tone === "predict" || tone === "saved";
    })
    .slice(0, 4);
  // Historial compacto: últimos finalizados con pronóstico, sin límite de día.
  const recentResults = recentFinishedWithPrediction(real, 3);
  const mine = ranking.find((entry) => entry.isCurrentUser);
  const gap = mine ? pointsToNextPosition(ranking, mine.user.id) : null;

  const triviaMax = trivia.reduce((sum, row) => sum + (row.status === "available" ? row.questionCount * triviaPointsForDifficulty(row.level) : 0), 0);

  function openTrivia(level: TriviaLevel) {
    sessionStorage.setItem("tobo-trivia-open", level);
    navigate("/tobo/trivias");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-[18px] font-extrabold leading-tight tracking-tight">{LVBP_EXPERIENCE_TITLE}</h1>
          <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{LVBP_SEASON_LABEL}</p>
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
          <span className="text-[13px] font-extrabold tabular-nums" aria-label="Puntos de la ronda actual">{formato(roundPoints)}</span>
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-5 sm:px-6 lg:px-8">
        {error && (
          <p className="rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>
            {error}
          </p>
        )}

        <FounderBanner />

        <ToboCard className="flyer-in">
          <h2 className="text-[20px] font-extrabold leading-snug">{LVBP_WELCOME_HEADLINE}</h2>
          <p className="mt-3 text-[14px] font-semibold leading-relaxed" style={{ color: "var(--t-muted)" }}>
            {LVBP_WELCOME_BODY}
          </p>
        </ToboCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ToboCard>
            <CardHead icon={CalendarDays} title="Ronda actual" />
            <h2 className="text-[18px] font-extrabold leading-tight tracking-tight">{cycle ? cycle.name : "Temporada"}</h2>
            {cycle && (
              <p className="mt-1 text-[14px] font-extrabold">{cycleSpanLabel(cycle)}</p>
            )}
            <p className="mt-2 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>
              🏆 {TOBO_ROUND_PRIZE_SUBTITLE}
            </p>
            {cycle && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {cycleClosesLabel(cycle.endsOn)}
              </p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <StatCell value={<>{formato(roundPoints)}<span className="ml-1 text-[11px]">PT</span></>} label={pointsAreRound ? "puntos de ronda" : "puntos totales"} />
              <StatCell value={mine ? `#${mine.position}` : "—"} label="puesto" />
              <StatCell value={gap ?? "—"} label={mine && mine.position > 1 ? "al anterior" : "distancia"} />
            </div>
          </ToboCard>

          <ToboCard className="sm:col-span-1 lg:col-span-1">
            <CardHead
              icon={CircleDot}
              title="Juega hoy"
              action={{ label: "Ver próximos →", onClick: () => navigate("/tobo/mi-quiniela") }}
            />
            <p className="mb-3 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
              {!ready
                ? "Cargando pronósticos…"
                : gamesToShow.length > 0
                  ? "Partidos programados para hoy"
                  : nextMatch
                    ? "No hay juegos hoy. Este es el próximo partido"
                    : "No hay pronósticos próximos todavía."}
            </p>
            {!ready ? null : gamesToShow.length > 0 ? (
              <div className="flex flex-col gap-3">
                {gamesToShow.map((match) => (
                  <MatchCard key={match.id} match={match} now={now} onOpen={() => navigate(`/tobo/partidos/${match.id}`)} />
                ))}
              </div>
            ) : nextMatch ? (
              <MatchCard match={nextMatch} now={now} onOpen={() => navigate(`/tobo/partidos/${nextMatch.id}`)} />
            ) : (
              <p className="text-[15px] font-extrabold">📅 No hay juegos programados a futuro.</p>
            )}
          </ToboCard>

          <ToboCard className="sm:col-span-2 lg:col-span-1">
            <CardHead icon={Users} title="Juega con los tuyos" />
            <p className="mb-3 text-[14px] font-extrabold">Crea una liga privada y compite con tus amigos.</p>
            <div className="grid grid-cols-2 gap-2">
              <GoldCta icon={Users} onClick={() => navigate("/tobo/ligas?tab=crear")}>Crear liga</GoldCta>
              <GhostCta icon={Users} onClick={() => navigate("/tobo/ligas?tab=unirme")}>Unirme</GhostCta>
            </div>
          </ToboCard>
        </div>

        <div>
          <GhostCta onClick={() => setMoreOpen((open) => !open)}>{moreOpen ? "Ocultar" : "Más pronósticos"}</GhostCta>
          {moreOpen && (
            <div className="mt-3 flex flex-col gap-3">
              {moreGames.length === 0 ? (
                <p className="text-[14px] font-extrabold">Por ahora no hay más juegos disponibles</p>
              ) : (
                moreGames.map((match) => (
                  <MatchCard key={match.id} match={match} now={now} onOpen={() => navigate(`/tobo/partidos/${match.id}`)} />
                ))
              )}
              <button
                type="button"
                onClick={() => navigate("/tobo/mi-quiniela")}
                className="min-h-11 text-[13px] font-extrabold"
                style={{ color: "var(--t-accent)" }}
              >
                Ver todos
              </button>
            </div>
          )}
        </div>

        {recentResults.length > 0 && (
          <ToboCard>
            <CardHead
              icon={Check}
              title="Tus últimos resultados"
              action={{ label: "Ver historial →", onClick: () => navigate("/tobo/mi-quiniela") }}
            />
            <div className="flex flex-col gap-2">
              {recentResults.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => navigate(`/tobo/partidos/${match.id}`)}
                  className="rounded-2xl p-3 text-left"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid var(--t-border)" }}
                >
                  <p className="text-[13px] font-extrabold">
                    {match.awayTeam} {match.awayScore ?? "–"} — {match.homeScore ?? "–"} {match.homeTeam}
                  </p>
                  <p className="mt-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                    Tu pronóstico: {match.prediction ? scoreLine(match, match.prediction.homeScore, match.prediction.awayScore) : "—"}
                    {match.prediction?.processed && match.prediction.total !== null ? (
                      <span className="ml-2 font-extrabold" style={{ color: "var(--t-accent)" }}>+{match.prediction.total} PT</span>
                    ) : (
                      <span className="ml-2">⏳ pendiente</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          </ToboCard>
        )}

        <ToboCard>
            <CardHead icon={Zap} title="Trivia de hoy" action={{ label: "Ver todos →", onClick: () => navigate("/tobo/trivias") }} />
            <p className="mb-3 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
              {triviaMax > 0 ? `Hasta ${formato(triviaMax)} puntos disponibles` : "Las trivias del día"}
            </p>
            <div className="flex flex-col gap-3">
              {TRIVIA_ROWS.map((row) => {
                const state = trivia.find((item) => item.level === row.level);
                const open = state?.status === "available" || state?.status === "in_progress";
                const cooling = state?.status === "cooldown";
                return (
                  <article key={row.level} className="rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid var(--t-border)" }}>
                    <div className="flex items-center gap-3">
                      <IconChip icon={row.icon} color={row.color} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-extrabold">{row.label}</p>
                        <p className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                          {!state || state.questionCount === 0
                            ? "Sin preguntas"
                            : `${state.questionCount} preguntas · +${triviaPointsForDifficulty(row.level)} PT por acierto`}
                        </p>
                      </div>
                      <p className="text-[16px] font-extrabold tabular-nums">
                        {!state || state.questionCount === 0 ? "—" : `${state.answeredCount}/${state.questionCount}`}
                      </p>
                    </div>
                    {open && (
                      <div className="mt-3">
                        <GoldCta icon={Play} onClick={() => openTrivia(row.level)}>{state?.status === "in_progress" ? "Continuar" : "Jugar ahora"}</GoldCta>
                      </div>
                    )}
                    {cooling && (
                      <p className="mt-3 flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: row.color }}>
                        <Check className="h-4 w-4" /> {formatCooldown(remainingMs(state?.availableAt ?? null, triviaSkew, now))}
                      </p>
                    )}
                    {state && state.questionCount === 0 && (
                      <p className="mt-3 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
                        <Lock className="h-4 w-4" /> Hoy no está disponible
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </ToboCard>

        <ToboCard>
          <CardHead
            icon={Trophy}
            title="Tabla LVBP"
            action={{ label: "Ver tabla →", onClick: () => navigate("/tobo/mi-quiniela?vista=tabla") }}
          />
          <p className="text-[14px] font-semibold leading-relaxed" style={{ color: "var(--t-muted)" }}>
            Clasificación de equipos según los resultados registrados. Es independiente del ranking de jugadores.
          </p>
        </ToboCard>
      </div>
      <TabBar />
    </div>
  );
}

