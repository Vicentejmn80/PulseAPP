import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { QrBlock } from "@/components/demo/QrBlock";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { SimulationStage, type SimulationVenue } from "@/components/simulation/SimulationStage";
import { canStartSimulator, venueQrPath } from "@/lib/demoMatch";
import type { ScenarioSummary } from "@/lib/simulation/types";
import {
  answerSimulationMoment,
  finishSimulationSession,
  listScenarios,
  logSimulationEvent,
  simulationSession,
  startSimulationSession,
  type SimulationSession,
} from "@/services/simulationApi";
import { listTascas, savePrediction, scoreLine, type BaseballMatch, type Tasca } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";

function parseScore(value: string) {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  return Number(value);
}

/**
 * Experiencia de partido del jugador.
 *
 * El guion lo decide el servidor; el reloj y la pantalla son del cliente.
 * El resultado que se muestra aqui es siempre de la SIMULACION: nunca se
 * escribe sobre el resultado oficial del partido.
 */
export function DemoExperience({
  match,
  onMatch,
}: {
  match: BaseballMatch;
  onMatch: (match: BaseballMatch) => void;
}) {
  const navigate = useNavigate();
  const { reload } = usePulse();
  const [winner, setWinner] = useState(match.prediction?.winner ?? "");
  const [home, setHome] = useState(match.prediction ? String(match.prediction.homeScore) : "");
  const [away, setAway] = useState(match.prediction ? String(match.prediction.awayScore) : "");
  const [session, setSession] = useState<SimulationSession | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [tascas, setTascas] = useState<Tasca[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const live = session?.status === "live";
  const saved = match.prediction;

  useEffect(() => {
    let alive = true;
    simulationSession(match.id)
      .then((next) => {
        if (alive && next.status !== "none") setSession(next);
      })
      .catch(() => undefined);
    listScenarios()
      .then((rows) => {
        if (!alive) return;
        setScenarios(rows);
        if (rows.length) setScenarioId(rows[0].id);
      })
      .catch(() => undefined);
    listTascas()
      .then((rows) => {
        if (alive) setTascas(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [match.id]);

  const scenario = scenarios.find((row) => row.id === scenarioId) ?? scenarios[0] ?? null;

  // La tasca es parte de la experiencia, no un adorno al final.
  const venue: SimulationVenue | null = (() => {
    const sponsor = tascas.find((row) => row.roundPrize) ?? tascas[0];
    if (!sponsor) return null;
    return {
      name: sponsor.name,
      prize: sponsor.roundPrize,
      detail: sponsor.prizeDetail ?? "",
      logoUrl: sponsor.logoUrl,
      slug: sponsor.slug,
    };
  })();

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const homeScore = parseScore(home);
    const awayScore = parseScore(away);
    if (!winner) {
      setError("Elige quien gana.");
      return;
    }
    if (homeScore === null || awayScore === null) {
      setError("El marcador tiene que ser un numero entero entre 0 y 99.");
      return;
    }
    if (homeScore === awayScore) {
      setError("En beisbol no se predice empate.");
      return;
    }
    if ((homeScore > awayScore && winner !== match.homeTeam) || (awayScore > homeScore && winner !== match.awayTeam)) {
      setError("El ganador no coincide con el marcador.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await savePrediction({ matchId: match.id, winner, homeScore, awayScore });
      onMatch({
        ...match,
        prediction: {
          id: match.prediction?.id ?? "local",
          winner,
          homeScore,
          awayScore,
          lockedAt: null,
          processed: false,
          winnerPoints: null,
          closenessPoints: null,
          total: null,
          errorTotal: null,
        },
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  }

  async function onPlay() {
    if (!scenario) {
      setError("La experiencia aun no esta disponible.");
      return;
    }
    setPending(true);
    setError("");
    try {
      setSession(await startSimulationSession(match.id, scenario.id));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo empezar.");
    } finally {
      setPending(false);
    }
  }

  const onAnswer = useCallback(
    async (momentId: string, optionId: string) => {
      try {
        const next = await answerSimulationMoment(match.id, momentId, optionId);
        // Una respuesta tardia no debe expulsar al jugador de una sesion ya cerrada.
        setSession((current) => (current?.finished ? current : next));
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : "No se pudo responder.");
      }
    },
    [match.id],
  );

  const onFinished = useCallback(() => {
    void finishSimulationSession(match.id)
      .then((next) => {
        setSession(next);
        return reload();
      })
      .catch(() => undefined);
  }, [match.id, reload]);

  const onTelemetry = useCallback(
    (type: string, dedupe: string) => {
      void logSimulationEvent(match.id, type, dedupe).catch(() => undefined);
    },
    [match.id],
  );

  if (live && scenario) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <BackButton onClick={() => navigate("/")} />
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
              Experiencia demo
            </p>
            <h2 className="text-[20px] font-extrabold tracking-tight">Simulacion</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
          <SimulationStage
            script={scenario.script}
            awayTeam={match.awayTeam}
            homeTeam={match.homeTeam}
            venue={venue}
            onAnswer={onAnswer}
            onFinished={onFinished}
            onTelemetry={onTelemetry}
            onVenue={() => venue?.slug && navigate(venueQrPath(venue.slug))}
          />
        </div>
      </div>
    );
  }

  if (session?.finished && scenario) {
    // El servidor ya liquido los aciertos y el bonus: se muestran sus cifras.
    const answers = Object.fromEntries(
      session.answers.filter((item) => item.optionId).map((item) => [item.id, item.optionId!]),
    );
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <BackButton onClick={() => navigate("/")} />
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
              Experiencia demo
            </p>
            <h2 className="text-[20px] font-extrabold tracking-tight">Simulacion</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
          <SimulationStage
            script={scenario.script}
            awayTeam={match.awayTeam}
            homeTeam={match.homeTeam}
            venue={venue}
            finished
            initialAnswers={answers}
            correctOverride={session.hits}
            creditedBonus={session.bonus}
            onVenue={() => venue?.slug && navigate(venueQrPath(venue.slug))}
          />
          <section className="mt-3 rounded-[28px] bg-white px-5 py-5">
            <h3 className="text-[24px] font-extrabold">Experiencia completada</h3>
            {saved && (
              <>
                <p className="mt-3 text-[14px] font-semibold text-[#8D7366]">Tu pronostico</p>
                <p className="text-[18px] font-extrabold">
                  {scoreLine(match, saved.homeScore, saved.awayScore)}
                </p>
              </>
            )}
            <p className="mt-3 text-[16px] font-extrabold">
              Momentos acertados: {session.hits} / {scenario.script.moments.length}
            </p>
            <p className="mt-3 text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">
              Puntos de esta experiencia
            </p>
            <p className="text-[30px] font-extrabold">+{session.bonus} PT</p>
            <p className="mt-3 text-[13px] font-semibold text-[#8D7366]">
              El marcador de la simulacion no cambia el resultado oficial del partido. Tu pronostico
              oficial se puntua aparte, cuando termine el juego real.
            </p>
            <div className="mt-4 flex gap-2">
              {venue?.slug && (
                <button
                  type="button"
                  onClick={() => navigate(venueQrPath(venue.slug!))}
                  className="h-12 flex-1 rounded-2xl bg-[#241710] text-[14px] font-extrabold text-white"
                >
                  Ver tasca
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate("/")}
                className="h-12 flex-1 rounded-2xl bg-[#FFF1EA] text-[14px] font-extrabold text-[#241710]"
              >
                Volver a inicio
              </button>
            </div>
          </section>
          {venue?.slug && (
            <div className="mt-3">
              <QrBlock
                value={`${window.location.origin}${venueQrPath(venue.slug)}`}
                title={`QR de ${venue.name}`}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
            Experiencia demo
          </p>
          <h2 className="text-[20px] font-extrabold tracking-tight">Simulacion</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        <form onSubmit={onSave} className="rounded-[28px] bg-white px-5 py-5">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
            Pronostico oficial
          </p>
          <h3 className="mt-2 text-[28px] font-extrabold leading-tight">{match.awayTeam}</h3>
          <p className="text-[14px] font-extrabold text-[#A08B80]">vs.</p>
          <h3 className="text-[28px] font-extrabold leading-tight">{match.homeTeam}</h3>
          <p className="mt-3 text-[13px] font-semibold text-[#8D7366]">
            Esto queda guardado como tu pronostico. El juego que sigue es una simulacion, no el
            resultado oficial.
          </p>
          <p className="mb-2 mt-5 text-[14px] font-extrabold">Quien gana?</p>
          <div className="grid grid-cols-2 gap-2">
            {[match.awayTeam, match.homeTeam].map((team) => (
              <button
                key={team}
                type="button"
                onClick={() => setWinner(team)}
                className={`min-h-12 rounded-2xl px-2 py-2 text-[14px] font-extrabold ${
                  winner === team ? "bg-[#FF4F1A] text-white" : "bg-[#FFF1EA] text-[#241710]"
                }`}
              >
                {team}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-5 text-[14px] font-extrabold">Predice el marcador</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] font-extrabold text-[#A08B80]">
              {match.awayTeam}
              <input
                inputMode="numeric"
                value={away}
                onChange={(event) => setAway(event.target.value)}
                className="mt-1 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[18px] font-extrabold text-[#241710] outline-none"
              />
            </label>
            <label className="text-[12px] font-extrabold text-[#A08B80]">
              {match.homeTeam}
              <input
                inputMode="numeric"
                value={home}
                onChange={(event) => setHome(event.target.value)}
                className="mt-1 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[18px] font-extrabold text-[#241710] outline-none"
              />
            </label>
          </div>
          {saved && (
            <p className="mt-4 text-[16px] font-extrabold">
              Tu pronostico: {scoreLine(match, saved.homeScore, saved.awayScore)}
            </p>
          )}
          <div className="mt-4">
            <PrimaryButton type="submit" disabled={pending}>
              {saved ? "Actualizar pronostico" : "Guardar pronostico"}
            </PrimaryButton>
          </div>

          {scenarios.length > 1 && (
            <div className="mt-5">
              <p className="text-[13px] font-extrabold text-[#A08B80]">Como se vera el partido</p>
              <div className="mt-2 flex flex-col gap-2">
                {scenarios.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setScenarioId(row.id)}
                    className={`rounded-2xl px-3 py-2.5 text-left ${
                      scenarioId === row.id
                        ? "bg-[#241710] text-white"
                        : "bg-[#FFF1EA] text-[#241710]"
                    }`}
                  >
                    <span className="block text-[13px] font-extrabold">{row.name}</span>
                    <span className="block text-[12px] font-semibold opacity-70">
                      {row.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              disabled={!canStartSimulator(saved) || pending || !scenario}
              onClick={() => void onPlay()}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#241710] text-[17px] font-extrabold text-white disabled:opacity-40"
            >
              PLAY BALL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
