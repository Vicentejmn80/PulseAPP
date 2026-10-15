import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { callRpc } from "@/services/accountApi";

export function AllyLandingPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Revisando la campaña…");
  const [error, setError] = useState("");

  useEffect(() => {
    const clean = code.trim().toLowerCase();
    if (!/^[a-z0-9]{6,32}$/.test(clean)) {
      setError("Ese enlace no es válido.");
      setMessage("");
      return;
    }
    let alive = true;
    const token = localStorage.getItem("pulse-session") ?? "";
    callRpc<{ ok?: boolean; error?: string; already?: boolean; points?: number; name?: string }>("pulse_campaign_claim", {
      p_token: token,
      p_code: clean,
    })
      .then((result) => {
        if (!alive) return;
        if (!result?.ok) {
          setError(result?.error || "No se pudo acreditar la recompensa.");
          setMessage("");
          return;
        }
        setMessage(result.already
          ? `Ya habías recibido la recompensa de ${result.name || "esta campaña"}.`
          : `Listo. Sumaste ${result.points ?? 0} puntos de ${result.name || "la campaña"}.`);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        const text = reason instanceof Error ? reason.message : "";
        setError(/does not exist|no existe|schema cache/i.test(text)
          ? "La campaña todavía no está activa en el servidor."
          : "No se pudo acreditar la recompensa.");
        setMessage("");
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[520px] flex-col justify-center bg-[#0B0D0F] px-5 text-[#F4F1EA]">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#CFFF00]">Rusher</p>
      <h1 className="mt-2 text-[32px] font-extrabold">Recompensa del local</h1>
      {message && <p className="mt-4 text-[16px] font-semibold">{message}</p>}
      {error && <p className="mt-4 text-[15px] font-bold text-[#E23B2F]">{error}</p>}
      <button type="button" onClick={() => navigate("/")} className="mt-6 min-h-12 rounded-2xl bg-[#CFFF00] text-[15px] font-extrabold text-[#0B0D0F]">
        Ir a Rusher
      </button>
    </div>
  );
}
