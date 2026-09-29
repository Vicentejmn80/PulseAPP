import { useState } from "react";
import { addEvent, openLive } from "@/services/liveApi";
import type { BaseballMatch } from "@/services/matchesApi";

const TYPES = [
  ["carrera", "Carrera"],
  ["jonron", "Jonrón"],
  ["hit", "Hit"],
  ["out", "Out"],
  ["ponche", "Ponche"],
  ["doble_play", "Doble play"],
  ["base_robada", "Robo"],
  ["error", "Error"],
  ["cambio_pitcher", "Pitcher"],
  ["otro", "Otro"],
] as const;

export function EventComposer({
  match,
  adminKey,
  onDone,
  onFail,
}: {
  match: BaseballMatch;
  adminKey: string;
  onDone: (message: string) => void;
  onFail: (message: string) => void;
}) {
  const [inning, setInning] = useState(match.inning || 1);
  const [half, setHalf] = useState<"alta" | "baja">(match.half || "alta");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function send(type: string) {
    if (!adminKey.trim()) {
      onFail("Escribe la clave de admin.");
      return;
    }
    let home = match.homeScore ?? 0;
    let away = match.awayScore ?? 0;
    if (type === "carrera" || type === "jonron") {
      if (half === "alta") away += 1;
      else home += 1;
    }
    setPending(true);
    try {
      await addEvent({
        adminKey: adminKey.trim(),
        matchId: match.id,
        inning,
        half,
        type,
        description: note,
        homeScore: home,
        awayScore: away,
      });
      setNote("");
      onDone("Jugada cargada.");
    } catch (reason: unknown) {
      onFail(reason instanceof Error ? reason.message : "No se pudo cargar la jugada.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl bg-[#FFF7F1] px-3 py-3">
      <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#FF4F1A]">Jugada en vivo</p>
      {match.status !== "in_progress" && (
        <button type="button" onClick={() => void openLive(adminKey.trim(), match.id).then(() => onDone("Juego en vivo.")).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo abrir."))} className="mt-2 h-11 w-full rounded-2xl bg-[#241710] text-[13px] font-extrabold text-white">
          Abrir en vivo
        </button>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => setInning((value) => Math.max(1, value - 1))} className="h-11 w-11 rounded-2xl bg-white text-[18px] font-extrabold">−</button>
        <p className="flex-1 text-center text-[15px] font-extrabold">{inning}.º</p>
        <button type="button" onClick={() => setInning((value) => Math.min(15, value + 1))} className="h-11 w-11 rounded-2xl bg-white text-[18px] font-extrabold">+</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["alta", "baja"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setHalf(value)} className={`h-11 rounded-2xl text-[13px] font-extrabold ${half === value ? "bg-[#FF4F1A] text-white" : "bg-white"}`}>
            {value === "alta" ? "Alta" : "Baja"}
          </button>
        ))}
      </div>
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Texto opcional" aria-label="Descripción de la jugada" className="mt-2 h-11 w-full rounded-2xl bg-white px-3 text-[14px] font-bold outline-none" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        {TYPES.map(([type, label]) => (
          <button key={type} type="button" disabled={pending} onClick={() => void send(type)} className="h-11 rounded-2xl bg-[#241710] text-[13px] font-extrabold text-white disabled:opacity-40">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
