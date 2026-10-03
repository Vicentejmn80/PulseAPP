import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Countdown } from "@/components/tobo/PilotExtras";
import { answerFlash, visitQr, type QrVisit } from "@/services/mechanicsApi";

const visits = new Map<string, Promise<QrVisit>>();

function visitOnce(token: string) {
  const current = visits.get(token);
  if (current) return current;
  const pending = visitQr(token).finally(() => visits.delete(token));
  visits.set(token, pending);
  return pending;
}

export function QrPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<QrVisit | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    visitOnce(token)
      .then((result) => {
        if (!alive) return;
        if (result.ok === false) setError(result.error || "No se pudo registrar la visita.");
        setVisit(result);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo registrar la visita.");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function choose(optionId: string) {
    if (!visit?.flash) return;
    setPending(true);
    setError("");
    try {
      await answerFlash(visit.flash.id, optionId);
      const fresh = await visitQr(token);
      setVisit(fresh);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo responder.");
    } finally {
      setPending(false);
    }
  }

  const venue = visit?.venue;
  const flash = visit?.flash;

  return (
    <div className="flex h-full flex-col px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
      <button type="button" onClick={() => navigate("/tobo")} className="text-[13px] font-extrabold text-[#FF4F1A]">Volver al inicio</button>
      {error && <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
      {venue && (
        <section className="mt-3 rounded-[28px] bg-white px-5 py-5">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Tasca</p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight">{venue.name}</h1>
          {venue.isFounder && <p className="mt-1 text-[12px] font-extrabold text-[#FF4F1A]">Fundadora</p>}
          {(venue.zone || venue.address) && <p className="mt-2 text-[14px] font-semibold text-[#8D7366]">{[venue.zone, venue.address].filter(Boolean).join(" · ")}</p>}
          {visit?.already ? (
            <p className="mt-3 text-[14px] font-bold">Hoy ya registramos tu visita aquí. Mañana suma de nuevo.</p>
          ) : (
            <p className="mt-3 text-[16px] font-extrabold text-[#FF4F1A]">Visita registrada · +{visit?.points ?? 0} pts</p>
          )}
          <h2 className="mt-4 text-[15px] font-extrabold">Lo que se vive aquí</h2>
          <p className="mt-1 text-[14px] font-semibold text-[#8D7366]">{venue.broadcasts || "Esta tasca todavía no publicó su programación."}</p>
        </section>
      )}
      {flash && flash.status === "open" && !flash.myOption && (
        <section className="mt-3 rounded-[28px] bg-[#241710] px-5 py-5 text-white">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF8A3C]">Pregunta relámpago</p>
            <p className="text-[16px] font-extrabold"><Countdown until={flash.closesAt} /></p>
          </div>
          <h2 className="mt-2 text-[22px] font-extrabold leading-tight">{flash.prompt}</h2>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {flash.options.map((option) => (
              <button key={option.id} type="button" disabled={pending} onClick={() => void choose(option.id)} className="min-h-12 rounded-2xl bg-white px-3 py-2 text-[15px] font-extrabold text-[#241710] disabled:opacity-40">
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {flash?.myOption && <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[14px] font-extrabold">Respuesta enviada. Si aciertas, suman +{flash.points} pts.</p>}
    </div>
  );
}
