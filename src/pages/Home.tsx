import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CircleDot,
  CalendarDays,
  Check,
  Clock,
  Hand,
  Lock,
  MapPin,
  Pencil,
  Play,
  Trophy,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { CardHead, GhostCta, GoldCta, IconChip, StatCell, ToboCard } from "@/components/tobo/surface";
import { IconCoin } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { pointsToNextPosition } from "@/lib/leaderboard";
import { caracasDateKey, homeMatchTone, pickActiveCycle } from "@/lib/toboHome";
import { TOBO_ROUND_PRIZE_SUBTITLE } from "@/config/tobo";
import { isUpcomingPrediction } from "@/lib/predictions/state";
import { callRpc } from "@/services/accountApi";
import { listCycles, listMatches, listRanking, listTascas, scoreLine, type BaseballMatch, type Tasca, type ToboCycle } from "@/services/matchesApi";
import { FounderBanner } from "@/components/tobo/FounderBanner";
import { todayTrivia, type TriviaLevel, type TriviaQuestion } from "@/services/triviaApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";
import type { LucideIcon } from "lucide-react";

const TRIVIA_ROWS: { level: TriviaLevel; label: string; icon: LucideIcon; color: string }[] = [
  { level: "beginner", label: "Básica", icon: CircleDot, color: "#22C55E" },
  { level: "intermediate", label: "Intermedia", icon: Hand, color: "#60A5FA" },
  { level: "advanced", label: "Avanzada", icon: Zap, color: "#C084FC" },
];

const MEDALS = ["#FFC94A", "#C5D0E0", "#D08A4A"];

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
  const upcoming = real
    .filter(isUpcomingPrediction)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const nextMatch =
    upcoming.find((m) => new Date(m.startsAt).getTime() >= now - 30 * 60 * 1000) ?? upcoming[0] ?? null;
  const predictedToday = today.filter((match) => match.prediction).length;
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
  const triviaAnswered = TRIVIA_ROWS.reduce((sum, row) => sum + trivia[row.level].filter((question) => question.answered).length, 0);
  const triviaCount = TRIVIA_ROWS.reduce((sum, row) => sum + trivia[row.level].length, 0);
  const triviaPending = TRIVIA_ROWS.some((row) => {
    const questions = trivia[row.level];
    return questions.length > 0 && questions.some((question) => !question.answered);
  });
  const predictionsPending = today.some((match) => homeMatchTone(match) === "predict");
  const dayComplete = ready && today.length + triviaMax > 0 && !predictionsPending && !triviaPending;

  const spotlight = tascas.find((tasca) => tasca.isFounder) ?? tascas[0] ?? null;
  const prizeLabels = [...new Set(
    tascas
      .map((tasca) => tasca.roundPrize)
      .filter((prize) => prize && prize !== "Por confirmar"),
  )].slice(0, 3);

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

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-5">
        {error && (
          <p className="rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>
            {error}
          </p>
        )}

        <section
          className="flyer-in relative overflow-hidden rounded-[22px] px-4 py-4"
          style={{
            background: "linear-gradient(145deg, #1A2E5A 0%, #0B1A3C 55%, #13284F 100%)",
            border: "1px solid rgba(255,201,74,0.35)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
          }}
        >
          <span
            className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,201,74,0.35), transparent 70%)" }}
          />
          <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>
            <Sparkles className="h-3.5 w-3.5" />
            Bienvenido a Pulse
          </p>
          <h2 className="mt-2 text-[22px] font-extrabold leading-tight">Pronostica. Suma. Gana.</h2>
          <p className="mt-1 max-w-[34ch] text-[13px] font-semibold leading-snug" style={{ color: "var(--t-muted)" }}>
            Elige el resultado de cada juego, acumula puntos y compite por un premio cada semana.
          </p>
        </section>

        <ToboCard>
          <CardHead icon={CalendarDays} title="Ronda actual" />
          <h2 className="text-[26px] font-extrabold leading-none">{cycle?.name ?? "Temporada"}</h2>
          <p className="mt-2 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>
            🏆 {TOBO_ROUND_PRIZE_SUBTITLE}
          </p>
          {cycle && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
              <CalendarDays className="h-3.5 w-3.5" />
              {rangeLabel(cycle.startsOn, cycle.endsOn)}
            </p>
          )}
          {cycle && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
              <Clock className="h-3.5 w-3.5" />
              {closesLabel(cycle.endsOn)}
            </p>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatCell value={<>{formato(mine?.points ?? 0)}<span className="ml-1 text-[11px]">PT</span></>} label="puntos" />
            <StatCell value={mine ? `#${mine.position}` : "—"} label="puesto" />
            <StatCell value={gap ?? "—"} label={mine && mine.position > 1 ? "al anterior" : "distancia"} />
          </div>
        </ToboCard>

        <ToboCard>
          <CardHead
            icon={CircleDot}
            title="Próximo juego"
            action={{ label: "Ver próximos →", onClick: () => navigate("/tobo/mi-quiniela") }}
          />
          <p className="mb-3 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
            {!ready
              ? "Cargando pronósticos…"
              : nextMatch
                ? "El próximo pronóstico disponible"
                : "No hay pronósticos próximos todavía."}
          </p>
          {!ready ? null : nextMatch ? (
            <div className="flex flex-col gap-3">
              <MatchCard match={nextMatch} now={now} onOpen={() => navigate(`/tobo/partidos/${nextMatch.id}`)} />
            </div>
          ) : (
            <p className="text-[15px] font-extrabold">📅 No hay juegos programados a futuro.</p>
          )}
        </ToboCard>

        <FounderBanner />

        <ToboCard>
          <CardHead icon={Zap} title="Trivia de hoy" action={{ label: "Ver todos →", onClick: () => navigate("/tobo/trivias") }} />
          <p className="mb-3 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
            {triviaMax > 0 ? `Hasta ${formato(triviaMax)} puntos disponibles` : "Las trivias del día"}
          </p>
          <div className="flex flex-col gap-3">
            {TRIVIA_ROWS.map((row) => {
              const questions = trivia[row.level];
              const answered = questions.filter((question) => question.answered).length;
              const max = questions.reduce((sum, question) => sum + question.points, 0);
              const done = questions.length > 0 && answered === questions.length;
              const open = questions.length > 0 && !done;
              return (
                <article key={row.level} className="rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid var(--t-border)" }}>
                  <div className="flex items-center gap-3">
                    <IconChip icon={row.icon} color={row.color} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-extrabold">{row.label}</p>
                      <p className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                        {questions.length === 0 ? "Sin preguntas hoy" : `${questions.length} preguntas · hasta ${formato(max)} pts`}
                      </p>
                    </div>
                    <p className="text-[16px] font-extrabold tabular-nums">
                      {questions.length === 0 ? "—" : `${answered}/${questions.length}`}
                    </p>
                  </div>
                  {open && (
                    <div className="mt-3">
                      <GoldCta icon={Play} onClick={() => openTrivia(row.level)}>Jugar ahora</GoldCta>
                    </div>
                  )}
                  {done && (
                    <p className="mt-3 flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: row.color }}>
                      <Check className="h-4 w-4" /> Completada
                    </p>
                  )}
                  {questions.length === 0 && (
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
          <CardHead icon={Check} title="Actividad de hoy" />
          <ActivityRow icon={CircleDot} color="#FFC94A" label="Pronósticos" value={`${predictedToday}/${today.length}`} />
          <ActivityRow icon={Zap} color="#C084FC" label="Trivia" value={`${triviaAnswered}/${triviaCount}`} />
          <ActivityRow icon={MapPin} color="#60A5FA" label="Tasca" value={qrPoints != null ? `+${formato(qrPoints)} PT` : "QR"} />
        </ToboCard>

        {dayComplete && (
          <ToboCard>
            <p className="text-[15px] font-extrabold">Has completado tus actividades de hoy.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <GhostCta onClick={() => navigate("/tobo/ranking")}>Ranking</GhostCta>
              <GhostCta onClick={() => navigate("/tobo/tascas")}>Tascas</GhostCta>
              <GhostCta onClick={() => navigate("/tobo/mi-quiniela")}>Calendario</GhostCta>
            </div>
          </ToboCard>
        )}

        <ToboCard>
          <CardHead icon={Trophy} title="Tu ronda" action={{ label: "Ver ranking →", onClick: () => navigate("/tobo/ranking") }} />
          <p className="mb-3 text-[14px] font-extrabold">{climb}</p>
          <GoldCta icon={Trophy} onClick={() => navigate("/tobo/ranking")}>Ver ranking</GoldCta>
        </ToboCard>

        <ToboCard className="overflow-hidden p-0">
          <div
            className="flex h-[88px] items-end px-4 pb-3"
            style={{
              background: spotlight?.imageUrl
                ? `linear-gradient(to top, rgba(7,14,31,0.82), rgba(7,14,31,0.15)), url(${spotlight.imageUrl}) center/cover`
                : "linear-gradient(135deg, #1E3A6E 0%, #0B1A3C 70%)",
            }}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white">Suma puntos en una tasca</p>
          </div>
          <div className="p-4">
            <p className="flex items-center gap-2 text-[16px] font-extrabold">
              <MapPin className="h-4 w-4" style={{ color: "var(--t-accent)" }} />
              {spotlight?.name ?? "Tasca participante"}
            </p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
              Visita una tasca participante y escanea el QR.
            </p>
            {qrPoints != null && qrPoints > 0 && (
              <p className="mt-2 text-[14px] font-extrabold" style={{ color: "var(--t-accent)" }}>+{formato(qrPoints)} PT hoy</p>
            )}
            <div className="mt-3">
              <GoldCta icon={MapPin} onClick={() => navigate("/tobo/tascas")}>Ver tascas</GoldCta>
            </div>
          </div>
        </ToboCard>

        <ToboCard>
          <CardHead icon={Trophy} title="Premios de esta ronda" />
          <p className="mb-3 text-[15px] font-extrabold">
            {prizeLabels.length > 0 ? `${prizeLabels.length} premios en juego` : "Hay premios que todavía puedes ganar."}
          </p>
          <div className="flex flex-col gap-3">
            {prizeLabels.map((prize, index) => (
              <div key={prize} className="flex items-center gap-3">
                <PrizeMark place={index + 1} />
                <p className="min-w-0 text-[14px] font-extrabold leading-tight">{prize}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
            Canjeable en cualquier tasca afiliada a Pulse.
          </p>
        </ToboCard>

        <ToboCard>
          <CardHead icon={Users} title="Juega con los tuyos" />
          <p className="mb-3 text-[14px] font-extrabold">Crea una liga privada y compite con tus amigos.</p>
          <div className="grid grid-cols-2 gap-2">
            <GoldCta icon={Users} onClick={() => navigate("/tobo/ligas?tab=crear")}>Crear liga</GoldCta>
            <GhostCta icon={Users} onClick={() => navigate("/tobo/ligas?tab=unirme")}>Unirme</GhostCta>
          </div>
        </ToboCard>
      </div>
      <TabBar />
    </div>
  );
}

function ActivityRow({ icon, color, label, value }: { icon: LucideIcon; color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderTop: "1px solid var(--t-border)" }}>
      <IconChip icon={icon} color={color} size="sm" />
      <p className="flex-1 text-[14px] font-extrabold">{label}</p>
      <p className="text-[15px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function PrizeMark({ place }: { place: number }) {
  const color = MEDALS[place - 1] ?? "#FFC94A";
  return (
    <span className="relative">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}22`, color }}
      >
        <Trophy className="h-6 w-6" />
      </span>
      <span
        className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold"
        style={{ backgroundColor: color, color: "#0B1A3C" }}
      >
        #{place}
      </span>
    </span>
  );
}
