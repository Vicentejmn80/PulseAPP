import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { halfLabel } from "@/components/live/LiveCenter";
import { rememberAdminKey, storedAdminKey } from "@/lib/adminKey";
import { simulationStatus, startSimulation, stopSimulation } from "@/services/liveApi";
import { simulateRoundClose, undoRoundClose, type DemoWinner } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";

export function SimulatorPage() {
  const navigate = useNavigate();
  const { currentUser } = usePulse();
  const [adminKey, setAdminKey] = useState(() => storedAdminKey(currentUser?.accessCode ?? ""));
  const [seconds, setSeconds] = useState("120");
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [winners, setWinners] = useState<DemoWinner[]>([]);
  const [demoNote, setDemoNote] = useState("");

  useEffect(() => {
    const key = adminKey.trim() || storedAdminKey(currentUser?.accessCode ?? "");
    if (key && key !== adminKey) setAdminKey(key);
    if (key) rememberAdminKey(key);
  }, [adminKey, currentUser?.accessCode]);

  useEffect(() => {
    if (!adminKey.trim()) return;
    let alive = true;
    async function load() {
      try {
        const status = await simulationStatus(adminKey.trim());
        if (!alive || !status?.ok) return;
        setRunning(Boolean(status.running) || status.status === "in_progress" || status.status === "finished");
        if (status.matchId) {
          setLine(`${status.running ? "Corriendo" : "Detenida"} · ${halfLabel(status.half || "alta", status.inning || 1)} · ${status.awayScore ?? 0}-${status.homeScore ?? 0}`);
        } else {
          setLine("");
          setRunning(false);
        }
      } catch (reason: unknown) {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo leer la simulación.");
      }
    }
    void load();
    const id = setInterval(() => void load(), 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [adminKey]);

  async function start() {
    setPending(true);
    setError("");
    try {
      await startSimulation(adminKey.trim(), Number(seconds) || 120);
      setRunning(true);
      navigate("/tobo/partidos/sim_live");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la simulación.");
    } finally {
      setPending(false);
    }
  }

  async function stop() {
    setPending(true);
    setError("");
    try {
      await stopSimulation(adminKey.trim());
      setRunning(false);
      setLine("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo borrar la simulación.");
    } finally {
      setPending(false);
    }
  }

  async function simulateClose() {
    setPending(true);
    setError("");
    try {
      const result = await simulateRoundClose(adminKey.trim());
      setWinners(result.winners ?? []);
      setDemoNote(
        result.awarded
          ? "Listo. Entra con la cuenta ganadora y abre Juégate el Tobo: verás ¡Ganaste!."
          : "Nadie tiene puntos todavía, así que no hubo ganadores.",
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo simular el cierre.");
    } finally {
      setPending(false);
    }
  }

  async function undoClose() {
    setPending(true);
    setError("");
    try {
      const result = await undoRoundClose(adminKey.trim());
      setWinners([]);
      setDemoNote(result.removed ? "Demostración deshecha. El ranking de octubre no se tocó." : "No había una demostración activa.");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo deshacer.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/admin/partidos")} />
        <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Simulación</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Partido de prueba</h2>
        <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Leones contra Magallanes, con badge de simulación. No entra al ranking, a los tobos ni a octubre.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <label className="block rounded-[24px] bg-white px-4 py-4">
          <span className="text-[13px] font-extrabold">Clave de admin</span>
          <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" autoComplete="off" />
        </label>
        <label className="mt-3 block rounded-[24px] bg-white px-4 py-4">
          <span className="text-[13px] font-extrabold">Segundos entre reportes</span>
          <input value={seconds} onChange={(event) => setSeconds(event.target.value)} inputMode="numeric" aria-label="Segundos" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
        </label>
        {line && <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[14px] font-extrabold">{line}</p>}
        {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        <button type="button" disabled={pending || !adminKey.trim()} onClick={() => void start()} className="mt-4 h-14 w-full rounded-2xl bg-[#FF4F1A] text-[16px] font-extrabold text-white disabled:opacity-40">
          Crear partido de prueba en vivo
        </button>
        {running && (
          <>
            <button type="button" onClick={() => navigate("/tobo/partidos/sim_live")} className="mt-2 h-12 w-full rounded-2xl bg-[#241710] text-[14px] font-extrabold text-white">
              Ver el partido
            </button>
            <button type="button" disabled={pending} onClick={() => void stop()} className="mt-2 h-12 w-full rounded-2xl bg-white text-[14px] font-extrabold text-[#E23B2F]">
              Detener y borrar simulación
            </button>
          </>
        )}

        <section className="mt-6 rounded-[24px] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Premios de demostración</p>
          <h3 className="mt-1 text-[18px] font-extrabold">Simular cierre de ronda</h3>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
            Toma los 3 primeros del ranking actual y crea códigos de 14 días. No cierra la ronda de octubre.
          </p>
          <button type="button" disabled={pending || !adminKey.trim()} onClick={() => void simulateClose()} className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[14px] bg-[#FFC53D] px-4 py-3 text-[15px] font-extrabold text-[#241710] disabled:opacity-40">
            Simular cierre de ronda ahora
          </button>
          <button type="button" disabled={pending || !adminKey.trim()} onClick={() => void undoClose()} className="mt-2 flex min-h-[48px] w-full items-center justify-center rounded-[14px] bg-[#FFF1EA] px-4 py-3 text-[14px] font-extrabold text-[#E23B2F] disabled:opacity-40">
            Deshacer esta simulación
          </button>
          {demoNote && <p className="mt-3 text-[13px] font-extrabold">{demoNote}</p>}
          {winners.map((winner) => (
            <div key={winner.code} className="mt-2 rounded-2xl bg-[#FFF7F1] px-3 py-3">
              <p className="text-[13px] font-extrabold">#{winner.rank} · {winner.alias}</p>
              <p className="text-[22px] font-extrabold tracking-[0.12em]">{winner.code}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
