import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QrBlock } from "@/components/demo/QrBlock";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { DEMO_MATCH_ID, venueQrPath } from "@/lib/demoMatch";
import { scanVenue, venueBySlug, type VenueCard } from "@/services/demoApi";

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function instagramUrl(handle: string) {
  if (!handle || handle === "Por confirmar") return "";
  if (handle.startsWith("http")) return handle;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

function whatsappUrl(num: string) {
  if (!num || num === "Por confirmar") return "";
  const digits = num.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

export function VenuePage({ guest = false }: { guest?: boolean }) {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<VenueCard | null>(null);
  const [error, setError] = useState("");
  const [visit, setVisit] = useState("");

  useEffect(() => {
    let alive = true;
    const load = guest
      ? venueBySlug(slug)
      : scanVenue(slug).then((result) => {
          if (alive) setVisit(result.already ? "Hoy ya registramos tu visita aquí." : "¡Visita registrada! ✅");
          return result.venue;
        });
    load
      .then((row) => { if (alive) setVenue(row); })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "Esa tasca no está activa.");
      });
    return () => { alive = false; };
  }, [guest, slug]);

  const qrValue = typeof window === "undefined" ? "" : `${window.location.origin}${venueQrPath(slug)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        {!guest && <BackButton onClick={() => navigate("/tobo/tascas")} />}
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {error && (
          <p className="mx-4 rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>
            {error}
          </p>
        )}

        {venue && (
          <div className="flex flex-col gap-0">
            {/* ── Hero cover ── */}
            <div
              className="relative flex h-[200px] items-end overflow-hidden"
              style={{
                background: venue.imageUrl
                  ? `url(${venue.imageUrl}) center/cover no-repeat`
                  : "linear-gradient(135deg, #070E1F 0%, #0B1A3C 55%, #132A55 100%)",
              }}
            >
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(7,14,31,0.92) 0%, transparent 55%)" }} />
              <div className="relative z-10 flex w-full items-end gap-4 px-5 pb-5">
                {venue.logoUrl ? (
                  <img src={venue.logoUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-2" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[30px]" style={{ backgroundColor: "var(--t-bg)" }}>
                    🍺
                  </span>
                )}
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-70" style={{ color: "var(--t-accent)" }}>
                    Tasca
                  </p>
                  <h1 className="text-[26px] font-extrabold leading-tight text-white">{venue.name}</h1>
                  {(venue.zone || venue.city) && (
                    <p className="text-[13px] font-semibold text-white/70">
                      {[venue.zone, venue.city].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-col gap-4 px-4 pt-4">

              {/* Visit notice */}
              {visit && (
                <p className="rounded-2xl px-4 py-3 text-center text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-tint)", color: "var(--t-accent)" }}>
                  {visit}
                </p>
              )}

              {/* Description */}
              {venue.description && (
                <div className="rounded-[24px] px-5 py-4" style={{ backgroundColor: "var(--t-card)" }}>
                  <p className="text-[14px] font-semibold leading-relaxed" style={{ color: "var(--t-muted)" }}>
                    {venue.description}
                  </p>
                  {venue.sponsorText && (
                    <p className="mt-2 text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>
                      {venue.sponsorText}
                    </p>
                  )}
                </div>
              )}

              {/* Prize */}
              <div className="rounded-[24px] px-5 py-5" style={{ backgroundColor: "var(--t-card)" }}>
                <p className="text-[12px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--t-accent)" }}>
                  🏆 Premio actual
                </p>
                <p className="mt-2 text-[24px] font-extrabold leading-snug">{venue.roundPrize || "Por confirmar"}</p>
                {venue.prizeDetail && (
                  <p className="mt-1.5 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
                    {venue.prizeDetail}
                  </p>
                )}
                {venue.prizeQuantity != null && venue.prizeQuantity > 0 && (
                  <p className="mt-2 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
                    Disponibles: {venue.prizeQuantity}
                  </p>
                )}
                {venue.prizeTerms && (
                  <p className="mt-2 text-[12px] font-semibold" style={{ color: "var(--t-muted)" }}>
                    {venue.prizeTerms}
                  </p>
                )}
              </div>

              {/* Highlights */}
              {(venue.highlights ?? []).length > 0 && (
                <div className="rounded-[24px] px-5 py-5" style={{ backgroundColor: "var(--t-card)" }}>
                  <p className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--t-accent)" }}>
                    ✨ Destacados
                  </p>
                  <div className="flex flex-col gap-3">
                    {(venue.highlights ?? []).map((h, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="shrink-0 text-[24px] leading-none">{h.icon}</span>
                        <div>
                          <p className="text-[15px] font-extrabold">{h.title}</p>
                          <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>{h.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Map card */}
              {venue.lat && venue.lng && (
                <div
                  className="overflow-hidden rounded-[24px]"
                  style={{ backgroundColor: "var(--t-card)" }}
                >
                  {/* Simulated map visual */}
                  <div
                    className="relative flex h-[120px] items-center justify-center"
                    style={{
                      background: "repeating-linear-gradient(0deg,transparent,transparent 31px,rgba(30,58,110,0.35) 32px), repeating-linear-gradient(90deg,transparent,transparent 31px,rgba(30,58,110,0.35) 32px), linear-gradient(135deg,#0B1A3C,#132A55)",
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[36px]">📍</span>
                      <span className="rounded-full px-3 py-1 text-[12px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
                        {venue.name}
                      </span>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    {venue.address && (
                      <p className="mb-3 flex items-start gap-2 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
                        <span className="shrink-0">📍</span>
                        <span>{venue.address}</span>
                      </p>
                    )}
                    <a
                      href={mapsUrl(venue.lat, venue.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-extrabold transition-opacity active:opacity-80"
                      style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
                    >
                      <span>🗺️</span>
                      Abrir en Google Maps
                    </a>
                  </div>
                </div>
              )}

              {/* Social links */}
              {(venue.instagram || venue.whatsapp) && (
                <div className="grid grid-cols-2 gap-3">
                  {venue.instagram ? (
                    <a
                      href={instagramUrl(venue.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl text-[14px] font-extrabold"
                      style={{ backgroundColor: "var(--t-card)", border: "2px solid var(--t-border)", color: "var(--t-text)" }}
                    >
                      <span>📸</span> Instagram
                    </a>
                  ) : <span />}
                  {venue.whatsapp ? (
                    <a
                      href={whatsappUrl(venue.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl text-[14px] font-extrabold"
                      style={{ backgroundColor: "var(--t-card)", border: "2px solid var(--t-border)", color: "var(--t-text)" }}
                    >
                      <span>💬</span> WhatsApp
                    </a>
                  ) : <span />}
                </div>
              )}

              {/* QR code */}
              {qrValue && (
                <div className="rounded-[24px] px-5 py-5" style={{ backgroundColor: "var(--t-card)" }}>
                  <p className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--t-accent)" }}>
                    📲 Escanea al visitar
                  </p>
                  <p className="mb-4 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
                    Escanea durante tu visita para participar y ganar puntos.
                  </p>
                  <QrBlock value={qrValue} title={`QR de ${venue.name}`} />
                  <p className="mt-2 text-center text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>
                    {venue.slug}
                  </p>
                </div>
              )}

              {/* CTA */}
              <div className="pb-2">
                <PrimaryButton
                  onClick={() => {
                    if (guest) {
                      sessionStorage.setItem("pulse-after-login", `/tobo/partidos/${DEMO_MATCH_ID}`);
                      navigate("/entrar");
                      return;
                    }
                    navigate(`/tobo/partidos/${DEMO_MATCH_ID}`);
                  }}
                >
                  Jugar en Pulse
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
