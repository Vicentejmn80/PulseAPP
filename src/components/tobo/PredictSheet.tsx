import { useState } from "react";
import { chosenWinner, TIE_PREDICTION_ERROR } from "@/config/scoring";
import { canSavePrediction } from "@/lib/matchAgenda";
import { savePrediction, type BaseballMatch } from "@/services/matchesApi";

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3" style={{ backgroundColor: "#101316", border: "1px solid #2A2F33" }}>
      <p className="min-w-0 text-[15px] font-extrabold leading-tight">{label}</p>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Menos carreras de ${label}`} onClick={() => onChange(Math.max(0, value - 1))} className="h-11 w-11 rounded-full bg-[#C6FF3D] text-[20px] font-extrabold text-[#0B0D0F]">−</button>
        <span className="w-8 text-center text-[22px] font-extrabold tabular-nums">{value}</span>
        <button type="button" aria-label={`Más carreras de ${label}`} onClick={() => onChange(Math.min(50, value + 1))} className="h-11 w-11 rounded-full bg-[#C6FF3D] text-[20px] font-extrabold text-[#0B0D0F]">+</button>
      </div>
    </div>
  );
}

export function PredictSheet({ match, now, onClose, onSaved }: {
  match: BaseballMatch;
  now: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [home, setHome] = useState(match.prediction?.homeScore ?? 0);
  const [away, setAway] = useState(match.prediction?.awayScore ?? 0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const closed = !canSavePrediction(match.startsAt, now);
  const winner = chosenWinner(match.homeTeam, home, match.awayTeam, away) ?? "";

  async function save() {
    if (closed || pending) return;
    if (home === away) {
      setError(TIE_PREDICTION_ERROR);
      return;
    }
    setPending(true);
    setError("");
    try {
      await savePrediction({ matchId: match.id, winner, homeScore: home, awayScore: away });
      onSaved();
      onClose();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="predict-title"
        className="w-full max-w-[560px] rounded-t-[24px] bg-[#14171A] px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 text-white"
        style={{ border: "1px solid #2A2F33" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="predict-title" className="text-[20px] font-extrabold">{match.awayTeam}</h2>
        <p className="text-[14px] font-extrabold text-[#C9D0D6]">vs {match.homeTeam}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Stepper label={match.awayTeam} value={away} onChange={setAway} />
          <Stepper label={match.homeTeam} value={home} onChange={setHome} />
        </div>
        {winner ? <p className="mt-3 text-[14px] font-extrabold">Elegiste ganador: {winner}</p> : null}
        {closed ? <p className="mt-3 text-[14px] font-extrabold text-[#FF8A8A]">Este juego acaba de cerrar</p> : null}
        {error ? <p className="mt-3 text-[13px] font-bold text-[#FF8A8A]">{error}</p> : null}
        <button type="button" disabled={closed || pending || !winner} onClick={() => void save()} className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#C6FF3D] text-[15px] font-extrabold text-[#0B0D0F] disabled:opacity-40">
          {pending ? "Guardando…" : "Guardar pronóstico"}
        </button>
      </div>
    </div>
  );
}
