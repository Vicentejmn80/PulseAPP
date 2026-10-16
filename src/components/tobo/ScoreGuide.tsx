import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  SCORE_RULES,
  pointsHint,
  scoreBands,
  scorePrediction,
  welcomeBody,
  type ScoreRules,
} from "@/config/scoring";
import { callRpc } from "@/services/accountApi";

const GUIDE_EVENT = "rusher-score-guide";

export function openScoreGuide() {
  window.dispatchEvent(new Event(GUIDE_EVENT));
}

async function loadRules(): Promise<ScoreRules & { bands: ReturnType<typeof scoreBands> }> {
  try {
    const result = await callRpc<{
      ok?: boolean;
      winnerPoints?: number;
      closenessPoints?: number;
      errorStep?: number;
      bands?: { error: string; closeness: number; total: number }[];
    }>("pulse_scoring_rules", {});
    if (result?.winnerPoints && result.closenessPoints && result.errorStep) {
      const rules = {
        winnerPoints: result.winnerPoints,
        closenessPoints: result.closenessPoints,
        errorStep: result.errorStep,
      };
      return { ...rules, bands: result.bands?.length ? result.bands : scoreBands(rules) };
    }
  } catch {
    // La tabla de respaldo sale de las mismas constantes. Los puntos del usuario no se calculan aquí.
  }
  return { ...SCORE_RULES, bands: scoreBands() };
}

export function PointsHint({ className = "" }: { className?: string }) {
  return <p className={`text-[12px] font-semibold text-[#8D7366] ${className}`}>{pointsHint()}</p>;
}

export function ScoreGuide() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<ScoreRules & { bands: ReturnType<typeof scoreBands> }>({ ...SCORE_RULES, bands: scoreBands() });

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      void loadRules().then(setRules);
    }
    window.addEventListener(GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(GUIDE_EVENT, onOpen);
  }, []);

  const sample = scorePrediction(5, 2, 6, 3, rules);
  const example = `Pronosticaste Magallanes 5 – Caracas 2 y terminó 6–3: acertaste el ganador (+${sample.winnerPoints}) y tu error fue ${sample.errorTotal} carreras (+${sample.closenessPoints}) = ${sample.total} puntos`;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={() => setOpen(false)} role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-guide-title"
            className="max-h-[85dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] bg-[#14171A] px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 text-white"
            style={{ border: "1px solid #2A2F33" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="score-guide-title" className="text-[20px] font-extrabold">¿Cómo se calculan mis puntos?</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-full text-[#C9D0D6]"><X className="h-5 w-5" /></button>
            </div>
            <ol className="mt-3 flex flex-col gap-2 text-[14px] font-semibold leading-relaxed text-[#C9D0D6]">
              <li>1. Aciertas el ganador: +{rules.winnerPoints}.</li>
              <li>2. Te acercas al marcador: hasta +{rules.closenessPoints} más.</li>
            </ol>
            <table className="mt-4 w-full text-left text-[13px]">
              <caption className="sr-only">Puntos según el margen de error</caption>
              <thead className="text-[11px] uppercase tracking-wide text-[#8B93A5]">
                <tr>
                  <th className="py-2 font-extrabold">Error</th>
                  <th className="py-2 font-extrabold">Cercanía</th>
                  <th className="py-2 font-extrabold">Total</th>
                </tr>
              </thead>
              <tbody>
                {rules.bands.map((row) => (
                  <tr key={row.error} className="border-t border-[#2A2F33]">
                    <td className="py-2 font-extrabold">{row.error}</td>
                    <td className="py-2 font-extrabold text-[#C6FF3D]">+{row.closeness}</td>
                    <td className="py-2 font-extrabold">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-[14px] font-semibold leading-relaxed text-[#C9D0D6]">{example}</p>
            <p className="mt-3 text-[14px] font-extrabold leading-relaxed">Si fallas el ganador, ese partido suma 0, aunque el marcador esté cerca.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function WelcomeScoreCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="rounded-[20px] p-4" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[20px] font-extrabold leading-snug">Bienvenido a Béisbol Rush LVBP</h2>
        <button type="button" onClick={onDismiss} aria-label="Cerrar bienvenida" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#C9D0D6]"><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-3 text-[14px] font-semibold leading-relaxed" style={{ color: "var(--t-muted)" }}>{welcomeBody()}</p>
      <button type="button" onClick={openScoreGuide} className="mt-4 min-h-11 text-[14px] font-extrabold text-[#C6FF3D]">
        ¿Cómo se calculan mis puntos?
      </button>
      <button type="button" onClick={onDismiss} className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-[#C6FF3D] text-[15px] font-extrabold text-[#0B0D0F]">
        Empezar
      </button>
    </section>
  );
}
