import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { halfLabel } from "@/components/live/LiveCenter";
import { BackButton } from "@/components/ui/Buttons";
import { rememberAdminKey, storedAdminKey } from "@/lib/adminKey";
import { reporterFinish, reporterState, reporterTap, type ReporterState } from "@/services/liveApi";
import { usePulse } from "@/state/PulseContext";

export function ReporterPage() {
  const { matchId = "" } = useParams();
  const navigate = useNavigate();
  const { currentUser } = usePulse();
  const [adminKey, setAdminKey] = useState(() => storedAdminKey(currentUser?.accessCode ?? ""));
  const [board, setBoard] = useState<ReporterState | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const key = adminKey.trim() || storedAdminKey(currentUser?.accessCode ?? "");
    if (key && key !== adminKey) setAdminKey(key);
    if (key) rememberAdminKey(key);
  }, [adminKey, currentUser?.accessCode]);

  async function load(key = adminKey) {
    if (!key.trim() || !matchId) return;
    const next = await reporterState(key.trim(), matchId);
    if (!next?.ok) throw new Error(next?.error || "No se pudo abrir el juego.");
    setBoard(next);
    setError("");
  }

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo abrir el juego."));
    // The key is read once to open the board. Later taps refresh it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function tap(action: "run_home" | "run_away" | "out" | "inning_change") {
    setPending(true);
    setError("");
    setConfirming(false);
    try {
      const next = await reporterTap(adminKey.trim(), matchId, action);
      setBoard(next);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo anotar.");
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    setPending(true);
    setError("");
    try {
      await reporterFinish(adminKey.trim(), matchId);
      navigate(`/tobo/partidos/${matchId}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo finalizar.");
      setPending(false);
    }
  }

  const live = board?.status === "in_progress";

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/admin/partidos")} />
        {board?.simulation && <p className="mt-2 text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F1A]">Simulación</p>}
        <h2 className="text-[22px] font-extrabold leading-tight">{board ? `${board.awayTeam} en ${board.homeTeam}` : "Corresponsal"}</h2>
        {board && live && (
          <p className="mt-1 text-[15px] font-extrabold">
            {board.awayScore}–{board.homeScore} · {halfLabel(board.half, board.inning)}
          </p>
        )}
        <p className="mt-1 text-[14px] font-extrabold text-[#FF4F1A]">
          Llevas {board?.reports ?? 0} {board?.reports === 1 ? "reporte" : "reportes"} en este juego
        </p>
      </div>

      {!board && (
        <label className="mx-4 rounded-[24px] bg-white px-4 py-4">
          <span className="text-[13px] font-extrabold">Clave de admin</span>
          <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" autoComplete="off" />
          <button type="button" onClick={() => void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo abrir."))} className="mt-3 h-12 w-full rounded-2xl bg-[#241710] text-[15px] font-extrabold text-white">Entrar</button>
        </label>
      )}

      {board && !live && <p className="mx-4 rounded-[24px] bg-white px-4 py-6 text-center text-[16px] font-extrabold">Este juego no está en vivo.</p>}

      {board && live && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => void tap("run_away")} className="rounded-[24px] bg-[#FF4F1A] px-3 text-[18px] font-extrabold leading-tight text-white disabled:opacity-40">
              +1 Carrera {board.awayTeam}
            </button>
            <button type="button" disabled={pending} onClick={() => void tap("run_home")} className="rounded-[24px] bg-[#241710] px-3 text-[18px] font-extrabold leading-tight text-white disabled:opacity-40">
              +1 Carrera {board.homeTeam}
            </button>
          </div>
          <button type="button" disabled={pending} onClick={() => void tap("out")} className="h-16 shrink-0 rounded-[24px] bg-white text-[22px] font-extrabold disabled:opacity-40">
            Out · {board.outs} de 2
          </button>
          <button type="button" disabled={pending} onClick={() => void tap("inning_change")} className="h-14 shrink-0 rounded-[24px] bg-white text-[16px] font-extrabold disabled:opacity-40">
            Cambio de inning manual
          </button>
          {confirming ? (
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="h-14 rounded-[24px] bg-white text-[15px] font-extrabold">Seguir</button>
              <button type="button" disabled={pending} onClick={() => void finish()} className="h-14 rounded-[24px] bg-[#E23B2F] text-[15px] font-extrabold text-white disabled:opacity-40">
                Cerrar {board.awayScore}–{board.homeScore}
              </button>
            </div>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className="h-14 shrink-0 rounded-[24px] bg-[#FFF1EA] text-[16px] font-extrabold text-[#E23B2F] disabled:opacity-40">
              Finalizar juego
            </button>
          )}
        </div>
      )}
      {error && <p className="px-4 pb-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
    </div>
  );
}
