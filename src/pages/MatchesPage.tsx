import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DuelBox, LiveCenter, ShareLine } from "@/components/live/LiveCenter";
import { MatchExtras } from "@/components/tobo/PilotExtras";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { TabBar } from "@/components/ui/TabBar";
import { matchCenter, type MatchCenter } from "@/services/liveApi";
import { DemoExperience } from "@/components/demo/DemoExperience";
import { getMatch, listMatches, matchPhase, savePrediction, scoreLine, type BaseballMatch, type MatchPrediction } from "@/services/matchesApi";

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function statusLabel(match: BaseballMatch) {
  const phase = matchPhase(match);
  if (phase === "cancelled" || match.status === "cancelled") return "Cancelado";
  if (match.status === "postponed" && phase === "open") return "Pospuesto";
  if (phase === "live") return "En vivo";
  if (phase === "locked") return "Pronóstico cerrado";
  if (phase === "finished") return "Finalizado";
  if (match.prediction) return "Pronosticado";
  return "Disponible";
}

export function MatchesPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listMatches()
      .then((rows) => {
        if (alive) setMatches(rows);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los partidos.");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/tobo")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Próximos partidos</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {matches.filter((match) => match.demo).map((match) => (
          <button key={match.id} type="button" onClick={() => navigate(`/tobo/partidos/${match.id}`)} className="mb-3 w-full rounded-[24px] bg-[#241710] px-4 py-4 text-left text-white">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FF8A3C]">Experiencia demo</p>
            <p className="mt-1 text-[18px] font-extrabold">{match.awayTeam} vs {match.homeTeam}</p>
            <p className="mt-1 text-[13px] font-semibold text-white/70">Predice y entra a la simulación</p>
          </button>
        ))}
        {matches.length === 0 && !error && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">Todavía no hay partidos</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Cuando se publique uno, vas a poder predecir el ganador y el marcador.</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {matches.filter((match) => !match.simulation).map((match) => {
            const phase = matchPhase(match);
            return (
              <button
                key={match.id}
                type="button"
                onClick={() => navigate(`/tobo/partidos/${match.id}`)}
                className="rounded-[24px] bg-white px-4 py-4 text-left shadow-[0_8px_20px_rgba(80,40,10,0.05)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-extrabold">{match.awayTeam}</p>
                    <p className="text-[12px] font-bold text-[#A08B80]">visitante</p>
                    <p className="mt-1 text-[15px] font-extrabold">{match.homeTeam}</p>
                    <p className="text-[12px] font-bold text-[#A08B80]">local</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#FFF1EA] px-2 py-1 text-[11px] font-extrabold text-[#FF4F1A]">{statusLabel(match)}</span>
                </div>
                <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">{when(match.startsAt)}</p>
                {phase === "finished" && match.homeScore !== null && match.awayScore !== null && (
                  <p className="mt-2 text-[14px] font-extrabold">Resultado {scoreLine(match, match.homeScore, match.awayScore)}</p>
                )}
                {phase === "open" && !match.prediction && <p className="mt-2 text-[13px] font-extrabold text-[#FF4F1A]">Haz tu pronóstico</p>}
                {match.prediction && phase !== "finished" && (
                  <p className="mt-1 text-[13px] font-bold text-[#241710]">{scoreLine(match, match.prediction.homeScore, match.prediction.awayScore)}</p>
                )}
                {phase === "finished" && match.prediction?.processed && match.prediction.total !== null && (
                  <p className="mt-1 text-[13px] font-extrabold text-[#FF4F1A]">+{match.prediction.total} puntos</p>
                )}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => navigate("/admin/partidos")} className="mt-6 text-[13px] font-extrabold text-[#A08B80]">
          Cargar resultado
        </button>
      </div>
      <TabBar />
    </div>
  );
}

function parseScore(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 99) return null;
  return score;
}

export function MatchPredictPage() {
  const { matchId = "" } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<BaseballMatch | null>(null);
  const [winner, setWinner] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    getMatch(matchId)
      .then((row) => {
        if (!alive) return;
        if (!row) {
          setMissing(true);
          return;
        }
        setMatch(row);
        if (row.prediction) {
          setWinner(row.prediction.winner);
          setHome(String(row.prediction.homeScore));
          setAway(String(row.prediction.awayScore));
        }
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo abrir el partido.");
      });
    return () => {
      alive = false;
    };
  }, [matchId]);

  useEffect(() => {
    if (match?.status !== "in_progress") return;
    const id = setInterval(() => {
      getMatch(matchId).then((row) => {
        if (row) setMatch(row);
      }).catch(() => undefined);
    }, 6000);
    return () => clearInterval(id);
  }, [match?.status, matchId]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!match) return;
    const homeScore = parseScore(home);
    const awayScore = parseScore(away);
    if (!winner) {
      setError("Elige quién gana.");
      return;
    }
    if (homeScore === null || awayScore === null) {
      setError("El marcador tiene que ser un número entero entre 0 y 99.");
      return;
    }
    if (homeScore === awayScore) {
      setError("En béisbol no se predice empate.");
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
      const fresh = await getMatch(match.id);
      if (fresh) setMatch(fresh);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  }

  const phase = match ? matchPhase(match) : "closed";
  const saved = match?.prediction;

  if (match?.demo) return <DemoExperience match={match} onMatch={setMatch} />;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/tobo/partidos")} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {missing && <p className="rounded-[28px] bg-white px-6 py-8 text-center text-[16px] font-extrabold">Ese partido no está publicado.</p>}
        {match && phase === "live" && match.featured && <LiveCenter matchId={match.id} />}
        {match && phase === "finished" && (
          <FinishedCard match={match} />
        )}
        {match && phase === "locked" && (
          <section className="rounded-[28px] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
            <h2 className="mt-2 text-[28px] font-extrabold tracking-tight">Pronóstico cerrado</h2>
            <p className="mt-3 text-[20px] font-extrabold">{match.awayTeam}</p>
            <p className="text-[14px] font-bold text-[#A08B80]">vs. {match.homeTeam}</p>
            {saved ? (
              <p className="mt-2 text-[18px] font-extrabold">{scoreLine(match, saved.homeScore, saved.awayScore)}</p>
            ) : (
              <p className="mt-2 text-[14px] font-semibold text-[#8D7366]">No alcanzaste a guardar una predicción.</p>
            )}
            <p className="mt-3 text-[14px] font-semibold text-[#8D7366]">El juego ya comenzó.</p>
          </section>
        )}
        {match && phase === "cancelled" && (
          <section className="rounded-[28px] bg-white px-5 py-5">
            <h2 className="text-[24px] font-extrabold">{match.awayTeam}</h2>
            <p className="text-[14px] font-bold text-[#A08B80]">vs. {match.homeTeam}</p>
            <p className="mt-2 text-[14px] font-semibold text-[#8D7366]">Este juego se canceló. No otorga puntos.</p>
          </section>
        )}
        {match && phase === "open" && (
          <form onSubmit={onSave} className="rounded-[28px] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
              {saved ? "Pronóstico guardado" : "Tu pronóstico"}
            </p>
            <h2 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">{match.awayTeam}</h2>
            <p className="text-[13px] font-bold text-[#A08B80]">visitante</p>
            <p className="mt-2 text-[14px] font-extrabold text-[#A08B80]">vs.</p>
            <h2 className="text-[26px] font-extrabold leading-tight tracking-tight">{match.homeTeam}</h2>
            <p className="text-[13px] font-bold text-[#A08B80]">local</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">{when(match.startsAt)}</p>
            {saved && <p className="mt-3 text-[16px] font-extrabold">{scoreLine(match, saved.homeScore, saved.awayScore)}</p>}
            <p className="mt-4 text-[13px] font-semibold text-[#8D7366]">Podrás editar tu pronóstico hasta que comience el juego.</p>
            <p className="mb-2 mt-5 text-[14px] font-extrabold">¿Quién gana?</p>
            <div className="grid grid-cols-2 gap-2">
              {[match.awayTeam, match.homeTeam].map((team) => (
                <button
                  key={team}
                  type="button"
                  onClick={() => setWinner(team)}
                  className={`min-h-12 rounded-2xl px-2 py-2 text-[13px] font-extrabold leading-tight ${winner === team ? "bg-[#FF4F1A] text-white" : "bg-[#FFF1EA] text-[#241710]"}`}
                >
                  {team}
                </button>
              ))}
            </div>
            <p className="mb-2 mt-5 text-[14px] font-extrabold">Marcador</p>
            <label className="block text-[12px] font-extrabold text-[#A08B80]">
              {match.awayTeam} · visitante
              <input
                inputMode="numeric"
                value={away}
                onChange={(event) => setAway(event.target.value)}
                aria-label={`Carreras de ${match.awayTeam}`}
                className="mt-1 h-14 w-full rounded-2xl bg-[#FFF7F1] text-center text-[22px] font-extrabold text-[#241710] outline-none"
              />
            </label>
            <label className="mt-2 block text-[12px] font-extrabold text-[#A08B80]">
              {match.homeTeam} · local
              <input
                inputMode="numeric"
                value={home}
                onChange={(event) => setHome(event.target.value)}
                aria-label={`Carreras de ${match.homeTeam}`}
                className="mt-1 h-14 w-full rounded-2xl bg-[#FFF7F1] text-center text-[22px] font-extrabold text-[#241710] outline-none"
              />
            </label>
            {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
            <div className="mt-4">
              <PrimaryButton type="submit" disabled={pending}>
                {pending ? "Guardando..." : saved ? "Guardar cambios" : "Confirmar pronóstico"}
              </PrimaryButton>
            </div>
          </form>
        )}
        {match && phase !== "live" && <MatchExtras matchId={match.id} />}
        {match && phase !== "live" && <MatchCrowd matchId={match.id} />}
        {error && phase !== "open" && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
      </div>
    </div>
  );
}

function almostLine(prediction: MatchPrediction) {
  if (!prediction.processed || prediction.winnerPoints == null || prediction.errorTotal == null) return "";
  if (prediction.winnerPoints === 0 && prediction.errorTotal >= 1 && prediction.errorTotal <= 4) {
    return "Te faltó poco: fallaste el ganador pero tu marcador estuvo cerquita.";
  }
  if (prediction.winnerPoints === 40 && prediction.errorTotal > 0) {
    const runs = prediction.errorTotal === 1 ? "carrera" : "carreras";
    return `Ibas perfecto en el ganador, te faltó el marcador exacto por ${prediction.errorTotal} ${runs}.`;
  }
  return "";
}

function MatchCrowd({ matchId }: { matchId: string }) {
  const [center, setCenter] = useState<MatchCenter | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    matchCenter(matchId).then((next) => {
      if (alive && next?.ok) setCenter(next);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [matchId, tick]);

  if (!center) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {center.winnerShare && (
        <section className="rounded-[24px] bg-white px-4 py-4">
          <h3 className="text-[16px] font-extrabold">Qué dice la gente</h3>
          <ShareLine share={center.winnerShare} empty="Equipo" />
        </section>
      )}
      <DuelBox matchId={matchId} duels={center.duels ?? []} onDone={() => setTick((value) => value + 1)} />
    </div>
  );
}

function FinishedCard({ match }: { match: BaseballMatch }) {
  const prediction = match.prediction;
  return (
    <section className="rounded-[28px] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
      <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
      <h2 className="mt-2 text-[22px] font-extrabold">Resultado</h2>
      <p className="mt-1 text-[20px] font-extrabold">
        {match.homeScore !== null && match.awayScore !== null ? scoreLine(match, match.homeScore, match.awayScore) : "Pendiente"}
      </p>
      <h3 className="mt-5 text-[16px] font-extrabold">Tu pronóstico</h3>
      {prediction ? (
        <p className="mt-1 text-[16px] font-extrabold">{scoreLine(match, prediction.homeScore, prediction.awayScore)}</p>
      ) : (
        <p className="mt-1 text-[14px] font-semibold text-[#8D7366]">No enviaste pronóstico. Este juego no te suma puntos.</p>
      )}
      {prediction?.processed && (
        <div className="mt-5 rounded-2xl bg-[#FFF7F1] px-4 py-4">
          <p className="text-[15px] font-extrabold">+{prediction.winnerPoints ?? 0} ganador</p>
          <p className="mt-1 text-[15px] font-extrabold">+{prediction.closenessPoints ?? 0} cercanía</p>
          <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Total</p>
          <p className="text-[22px] font-extrabold text-[#FF4F1A]">+{prediction.total ?? 0} puntos</p>
          {almostLine(prediction) && <p className="mt-3 text-[14px] font-extrabold">{almostLine(prediction)}</p>}
        </div>
      )}
    </section>
  );
}
