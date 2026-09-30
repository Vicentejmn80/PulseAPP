import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QrBlock } from "@/components/demo/QrBlock";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { DEMO_MATCH_ID, venueQrPath } from "@/lib/demoMatch";
import { scanVenue, venueBySlug, type VenueCard } from "@/services/demoApi";

export function VenuePage({ guest = false }: { guest?: boolean }) {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<VenueCard | null>(null);
  const [error, setError] = useState("");
  const [visit, setVisit] = useState("");

  useEffect(() => {
    let alive = true;
    const load = guest ? venueBySlug(slug) : scanVenue(slug).then((result) => {
      if (alive) setVisit(result.already ? "Hoy ya registramos tu visita aquí." : "Visita registrada.");
      return result.venue;
    });
    load
      .then((row) => {
        if (alive) setVenue(row);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "Esa tasca no está activa.");
      });
    return () => {
      alive = false;
    };
  }, [guest, slug]);

  const qrValue = typeof window === "undefined" ? "" : `${window.location.origin}${venueQrPath(slug)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        {!guest && <BackButton onClick={() => navigate("/tascas")} />}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {error && <p className="rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {venue && (
          <section className="rounded-[28px] bg-white px-5 py-5">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Tasca</p>
            <div className="mt-2 flex items-center gap-3">
              {venue.logoUrl ? <img src={venue.logoUrl} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1EA] text-[26px]">🍻</span>}
              <h1 className="text-[28px] font-extrabold leading-tight">{venue.name}</h1>
            </div>
            <p className="mt-3 text-[16px] font-semibold text-[#8D7366]">{venue.sponsorText || "Esta tasca forma parte de Juégate el Tobo."}</p>
            {(venue.zone || venue.city) && <p className="mt-2 text-[14px] font-extrabold">{[venue.zone, venue.city].filter(Boolean).join(" · ")}</p>}
            {venue.address && <p className="mt-1 text-[14px] font-semibold text-[#8D7366]">{venue.address}</p>}
            {venue.description && <p className="mt-3 text-[14px] font-semibold text-[#8D7366]">{venue.description}</p>}
            <div className="mt-4 rounded-2xl bg-[#FFF7F1] px-4 py-4">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Premio actual</p>
              <p className="mt-1 text-[22px] font-extrabold">{venue.roundPrize || "Por confirmar"}</p>
              {venue.prizeDetail && <p className="mt-1 text-[14px] font-semibold text-[#8D7366]">{venue.prizeDetail}</p>}
              <p className="mt-2 text-[13px] font-bold text-[#8D7366]">Cantidad disponible: {venue.prizeQuantity}</p>
              {venue.prizeTerms && <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">{venue.prizeTerms}</p>}
            </div>
            <p className="mt-4 text-[14px] font-semibold text-[#8D7366]">Escanea durante tu visita para participar.</p>
            {visit && <p className="mt-2 text-[14px] font-extrabold text-[#FF4F1A]">{visit}</p>}
            {qrValue && (
              <div className="mt-4">
                <QrBlock value={qrValue} title={`QR de ${venue.name}`} />
                <p className="mt-2 text-center text-[12px] font-bold text-[#A08B80]">{venue.slug}</p>
              </div>
            )}
            <div className="mt-4">
              <PrimaryButton
                onClick={() => {
                  if (guest) {
                    sessionStorage.setItem("pulse-after-login", `/partidos/${DEMO_MATCH_ID}`);
                    navigate("/entrar");
                    return;
                  }
                  navigate(`/partidos/${DEMO_MATCH_ID}`);
                }}
              >
                Jugar en Pulse
              </PrimaryButton>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
