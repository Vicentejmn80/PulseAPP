import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { Countdown, WowBurst } from "@/components/world/Wow";
import { QR_INTERACTIONS } from "@/data/mock/world";
import { venueRepository } from "@/services/repositories";
import { useWorld } from "@/state/useWorld";

export function DiscoverPage() {
  const { qrId } = useParams();
  const navigate = useNavigate();
  const world = useWorld();
  const qr = QR_INTERACTIONS.find((item) => item.id === qrId);
  const [stage, setStage] = useState<"hint" | "venue" | "scan" | "found">("hint");
  const venue = venueRepository.getByIds(qr?.venueId ? [qr.venueId] : [])[0];
  const already = qr ? world.foundQrIds.includes(qr.id) : false;

  if (!qr) {
    return (
      <div className="flex h-full items-center justify-center">
        <button type="button" onClick={() => navigate("/")} className="font-extrabold text-[#FF4F1A]">Volver</button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <WowBurst message={world.wow} onDone={world.clearWow} />
      <div className="flex h-11 items-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate(-1)} />
        <p className="flex-1 pr-9 text-center text-[15px] font-extrabold">Descubrir</p>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-8">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
          {qr.secret ? "Reto secreto" : "Código Pulse"}
        </p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight">
          {already || stage === "found" ? "Encontrado" : qr.secret ? "Hay algo escondido cerca." : qr.title}
        </h1>
        <Countdown until={qr.activeUntil} />
        <p className="mt-3 text-[15px] font-semibold text-[#8D7366]">
          {already ? qr.effect.clue || "Este código ya cuenta en tu ruta." : stage === "hint" ? qr.hint : stage === "venue" ? venue?.name ?? "Un local participante" : "Acerca el código. Por ahora es una simulación."}
        </p>
        {venue && stage !== "hint" && (
          <p className="mt-2 text-[13px] font-bold text-[#241710]">{venue.address}</p>
        )}
        <div className="mt-auto">
          {already || stage === "found" ? (
            <PrimaryButton
              onClick={() => {
                if (qr.effect.gameId) navigate(`/play/${qr.effect.gameId}`);
                else navigate(`/mission/${world.route.id}`);
              }}
            >
              {qr.effect.gameId ? "Abrir el reto" : "Volver a la ruta"}
            </PrimaryButton>
          ) : stage === "hint" ? (
            <PrimaryButton onClick={() => setStage("venue")}>Ir a descubrir</PrimaryButton>
          ) : stage === "venue" ? (
            <PrimaryButton onClick={() => setStage("scan")}>Estoy en el local</PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={() => {
                world.findQr(qr);
                setStage("found");
              }}
            >
              Escanear código
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}
