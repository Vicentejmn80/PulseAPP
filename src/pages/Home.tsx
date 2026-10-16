import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCoin } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { cycleContainingToday, cycleSpanLabel, pickActiveCycle } from "@/lib/toboHome";
import { LVBP_EXPERIENCE_TITLE, LVBP_SEASON_LABEL } from "@/config/lvbpBrand";
import { NotificationBell } from "@/components/tobo/NotificationBell";
import { HomeAgenda } from "@/components/tobo/HomeAgenda";
import { PredictSheet } from "@/components/tobo/PredictSheet";
import { openScoreGuide, WelcomeScoreCard } from "@/components/tobo/ScoreGuide";
import { markOnboardingSeen } from "@/services/accountApi";
import { listCycles, listMatches, loadCycleBoard, type BaseballMatch, type ToboCycle } from "@/services/matchesApi";
import { FounderBanner } from "@/components/tobo/FounderBanner";
import { serverSkewMs, triviaStatus } from "@/services/triviaApi";
import { usePulse } from "@/state/PulseContext";

export function HomePage() {
  const navigate = useNavigate();
  const { currentUser, reload } = usePulse();
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [cycle, setCycle] = useState<ToboCycle | null>(null);
  const [roundPoints, setRoundPoints] = useState(0);
  const [skew, setSkew] = useState(0);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<BaseballMatch | null>(null);
  const seen = Boolean(currentUser?.onboardingVistoAt);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    function load() {
      Promise.all([reload(), listMatches(), listCycles(), triviaStatus()])
        .then(async ([, matchRows, cycles, boardTrivia]) => {
          if (!alive) return;
          const active = pickActiveCycle(cycles);
          const live = cycleContainingToday(cycles);
          const board = await loadCycleBoard(live?.id ?? "lifetime");
          if (!alive) return;
          setMatches(matchRows);
          setCycle(active);
          setRoundPoints(board.points);
          setSkew(serverSkewMs(boardTrivia.serverNow));
        })
        .catch((reason: unknown) => {
          if (!alive) return;
          setError(reason instanceof Error ? reason.message : "No se pudo cargar la jornada.");
        });
    }
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [reload]);

  const real = matches.filter((match) => !match.simulation && !match.demo);
  const clock = now + skew;

  function dismissIntro() {
    void markOnboardingSeen()
      .then(() => reload())
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "No se pudo cerrar la bienvenida.");
      });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-[18px] font-extrabold leading-tight tracking-tight">{LVBP_EXPERIENCE_TITLE}</h1>
          <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{cycle ? `${cycle.name} · ${cycleSpanLabel(cycle)}` : LVBP_SEASON_LABEL}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell />
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
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        {error ? (
          <p className="rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>{error}</p>
        ) : null}
        {!seen ? (
          <>
            <FounderBanner />
            <WelcomeScoreCard onDismiss={dismissIntro} />
          </>
        ) : (
          <button type="button" onClick={openScoreGuide} className="min-h-11 self-start text-[13px] font-extrabold text-[#C6FF3D]">
            ¿Cómo se ganan puntos?
          </button>
        )}
        <HomeAgenda matches={real} now={clock} onPredict={setSheet} />
      </div>
      {sheet ? (
        <PredictSheet
          match={matches.find((match) => match.id === sheet.id) ?? sheet}
          now={clock}
          onClose={() => setSheet(null)}
          onSaved={() => {
            listMatches().then(setMatches).catch(() => undefined);
          }}
        />
      ) : null}
      <TabBar />
    </div>
  );
}
