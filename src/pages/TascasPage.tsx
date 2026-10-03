import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TabBar } from "@/components/ui/TabBar";
import { listCycles, listTascas, type Tasca, type ToboCycle } from "@/services/matchesApi";

function externalHref(kind: "instagram" | "whatsapp" | "maps", value: string, lat?: number | null, lng?: number | null) {
  if (kind === "maps") {
    if (!lat || !lng) return "";
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const text = value.trim();
  if (!text || text === "Por confirmar") return "";
  if (kind === "instagram") {
    if (text.startsWith("http")) return text;
    return `https://instagram.com/${text.replace(/^@/, "")}`;
  }
  const digits = text.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function VenueCard({ tasca, onView }: { tasca: Tasca; onView: () => void }) {
  const instagram = externalHref("instagram", tasca.instagram || "");
  const mapsUrl = externalHref("maps", "", tasca.lat, tasca.lng);
  const highlights = tasca.highlights ?? [];

  return (
    <article
      className="venue-card-in overflow-hidden rounded-[28px]"
      style={{ backgroundColor: "var(--t-card)" }}
    >
      {/* Photo / cover area */}
      <div
        className="relative flex h-[120px] items-end overflow-hidden px-4 pb-4"
        style={{
          background: tasca.imageUrl
            ? `url(${tasca.imageUrl}) center/cover no-repeat`
            : "linear-gradient(135deg, #132A55 0%, #0B1A3C 60%, #1E3A6E 100%)",
        }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(7,14,31,0.85) 0%, transparent 60%)" }} />
        <div className="relative z-10 flex w-full items-end gap-3">
          {tasca.logoUrl ? (
            <img src={tasca.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-yellow-400" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-[20px]" style={{ backgroundColor: "var(--t-bg)" }}>
              🍺
            </span>
          )}
          <div className="flex-1">
            <h3 className="text-[18px] font-extrabold text-white leading-tight">{tasca.name}</h3>
            <p className="text-[12px] font-semibold text-white/70">
              {[tasca.zone, tasca.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          {tasca.isFounder && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold"
              style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
            >
              FUNDADORA
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-4">
        {/* Prize */}
        <div className="mb-3 rounded-2xl px-4 py-3" style={{ backgroundColor: "var(--t-tint)" }}>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--t-accent)" }}>
            🏆 Premio de la semana
          </p>
          <p className="mt-0.5 text-[16px] font-extrabold">{tasca.roundPrize || "Por confirmar"}</p>
        </div>

        {/* Highlights chips */}
        {highlights.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {highlights.slice(0, 3).map((h, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-extrabold"
                style={{ backgroundColor: "var(--t-bg)", color: "var(--t-text)" }}
              >
                <span>{h.icon}</span>
                <span>{h.title}</span>
              </span>
            ))}
          </div>
        )}

        {/* Address (if available) */}
        {tasca.address && tasca.address !== "Por confirmar" && (
          <p className="mb-3 flex items-start gap-1.5 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
            <span className="mt-0.5 shrink-0">📍</span>
            <span>{tasca.address}</span>
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {/* Maps button (primary when available) */}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl text-[14px] font-extrabold transition-opacity active:opacity-80"
              style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
            >
              <span className="text-[16px]">🗺️</span>
              Abrir en Google Maps
            </a>
          ) : null}

          {/* Social + view */}
          <div className="grid grid-cols-2 gap-2">
            {instagram ? (
              <a
                href={instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-extrabold"
                style={{ backgroundColor: "var(--t-bg)", color: "var(--t-text)", border: "1px solid var(--t-border)" }}
              >
                <span>📸</span> Instagram
              </a>
            ) : (
              <span
                className="flex h-11 items-center justify-center rounded-2xl text-[12px] font-bold"
                style={{ backgroundColor: "var(--t-bg)", color: "var(--t-muted)", border: "1px solid var(--t-border)" }}
              >
                Instagram
              </span>
            )}
            {tasca.slug ? (
              <button
                type="button"
                onClick={onView}
                className="flex h-11 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-extrabold transition-opacity active:opacity-80"
                style={{ backgroundColor: "var(--t-border)", color: "var(--t-text)" }}
              >
                Ver tasca →
              </button>
            ) : (
              <span
                className="flex h-11 items-center justify-center rounded-2xl text-[12px] font-bold"
                style={{ backgroundColor: "var(--t-bg)", color: "var(--t-muted)", border: "1px solid var(--t-border)" }}
              >
                Sin página
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function TascasPage() {
  const navigate = useNavigate();
  const [tascas, setTascas] = useState<Tasca[]>([]);
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listTascas(), listCycles()])
      .then(([tascaRows, cycleRows]) => {
        if (alive) {
          setTascas(tascaRows);
          setCycles(cycleRows);
        }
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las tascas.");
      });
    return () => { alive = false; };
  }, []);

  const active = cycles.find((c) => c.status === "open") ?? cycles[0];
  const activeTascas = tascas.filter((t) => t.active !== false);
  const withPrize = activeTascas.filter((t) => t.roundPrize && t.roundPrize !== "Por confirmar");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>
          Juégate el Tobo
        </p>
        <h2 className="text-[26px] font-extrabold tracking-tight">Red Pulse 🍺</h2>
        <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
          La red de tascas que hace posibles los premios.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && (
          <p className="mb-3 rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>
            {error}
          </p>
        )}

        {/* Stats banner */}
        <div
          className="mb-4 rounded-[28px] p-5 text-white"
          style={{ background: "linear-gradient(135deg, var(--t-accent-dim) 0%, var(--t-accent) 100%)", color: "var(--t-accent-text)" }}
        >
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] opacity-80">
            Premios de esta semana
          </p>
          <p className="mt-0.5 text-[13px] font-semibold opacity-70">
            {active ? `${active.name} · ${active.startsOn} al ${active.endsOn}` : "Temporada LVBP 2026-27"}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { n: activeTascas.length, label: "tascas" },
              { n: withPrize.length,    label: "premios" },
              { n: 3,                   label: "ganadores" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl p-3 text-center" style={{ backgroundColor: "rgba(0,0,0,0.18)" }}>
                <p className="text-[24px] font-extrabold">{item.n}</p>
                <p className="text-[11px] font-bold opacity-80">{item.label}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate("/tobo/premios")}
            className="mt-4 h-12 w-full rounded-2xl text-[15px] font-extrabold"
            style={{ backgroundColor: "rgba(0,0,0,0.2)", color: "var(--t-accent-text)" }}
          >
            Ver mis premios →
          </button>
        </div>

        {/* Section label */}
        <p
          className="mb-3 px-1 text-[12px] font-extrabold uppercase tracking-[0.14em]"
          style={{ color: "var(--t-muted)" }}
        >
          Tascas participantes
        </p>

        {tascas.length === 0 && !error && (
          <div className="rounded-[28px] px-6 py-8 text-center" style={{ backgroundColor: "var(--t-card)" }}>
            <p className="text-[16px] font-extrabold">Las tascas se publican aquí</p>
            <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
              Pronto verás la red de tascas del piloto.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {tascas.map((tasca, i) => (
            <div key={tasca.id} style={{ animationDelay: `${i * 60}ms` }}>
              <VenueCard
                tasca={tasca}
                onView={() => navigate(`/tobo/venue/${tasca.slug}`)}
              />
            </div>
          ))}
        </div>
      </div>

      <TabBar />
    </div>
  );
}
