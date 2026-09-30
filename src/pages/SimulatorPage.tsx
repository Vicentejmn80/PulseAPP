import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { halfLabel } from "@/components/live/LiveCenter";
import { rememberAdminKey, storedAdminKey } from "@/lib/adminKey";
import { simulationStatus, startSimulation, stopSimulation } from "@/services/liveApi";
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
      navigate("/partidos/sim_live");
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
            <button type="button" onClick={() => navigate("/partidos/sim_live")} className="mt-2 h-12 w-full rounded-2xl bg-[#241710] text-[14px] font-extrabold text-white">
              Ver el partido
            </button>
            <button type="button" disabled={pending} onClick={() => void stop()} className="mt-2 h-12 w-full rounded-2xl bg-white text-[14px] font-extrabold text-[#E23B2F]">
              Detener y borrar simulación
            </button>
          </>
        )}
      </div>
    </div>
  );
}
