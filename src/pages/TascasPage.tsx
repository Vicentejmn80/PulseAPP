import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TabBar } from "@/components/ui/TabBar";
import { listCycles, listTascas, type Tasca, type ToboCycle } from "@/services/matchesApi";

function externalHref(kind: "instagram" | "whatsapp", value: string) {
  const text = value.trim();
  if (!text || text === "Por confirmar") return "";
  if (kind === "instagram") {
    if (text.startsWith("http")) return text;
    return `https://instagram.com/${text.replace(/^@/, "")}`;
  }
  const digits = text.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
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
    return () => {
      alive = false;
    };
  }, []);

  const active = cycles.find((c) => c.status === "open") ?? cycles[0];
  const activeTascas = tascas.filter((t) => t.active !== false);
  const withPrize = activeTascas.filter((t) => t.roundPrize && t.roundPrize !== "Por confirmar");

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Red Pulse</h2>
        <p className="text-[13px] font-semibold text-[#8D7366]">La red de tascas que hace posibles los premios.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        {/* PREMIOS DE ESTA SEMANA */}
        <div className="mb-3 rounded-[28px] bg-gradient-to-br from-[#FF8A3C] via-[#FF4F1A] to-[#E8360C] p-5 text-white shadow-[0_16px_32px_rgba(255,79,26,0.28)]">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/80">Premios de esta semana</p>
          <p className="mt-1 text-[14px] font-semibold text-white/80">
            {active ? `${active.name} · ${active.startsOn} al ${active.endsOn}` : "Temporada LVBP 2026-27"}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/20 p-3 text-center">
              <p className="text-[22px] font-extrabold">{activeTascas.length}</p>
              <p className="text-[11px] font-bold text-white/80">tascas</p>
            </div>
            <div className="rounded-2xl bg-white/20 p-3 text-center">
              <p className="text-[22px] font-extrabold">{withPrize.length}</p>
              <p className="text-[11px] font-bold text-white/80">premios</p>
            </div>
            <div className="rounded-2xl bg-white/20 p-3 text-center">
              <p className="text-[22px] font-extrabold">3</p>
              <p className="text-[11px] font-bold text-white/80">ganadores</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/tobo/premios")}
            className="mt-4 h-12 w-full rounded-2xl bg-white text-[16px] font-extrabold text-[#FF4F1A]"
          >
            Ver premios
          </button>
        </div>

        {/* TASCAS */}
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Tascas participantes</p>
        </div>

        {tascas.length === 0 && !error && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">Las tascas se publican aqui</p>
            <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Pronto vas a ver la red de tascas del piloto.</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {tascas.map((tasca) => {
            const instagram = externalHref("instagram", tasca.instagram || "");
            const whatsapp = externalHref("whatsapp", tasca.whatsapp || "");
            return (
              <article key={tasca.id} className="rounded-[24px] bg-white px-4 py-4">
                <div className="flex items-start gap-3">
                  {tasca.logoUrl ? (
                    <img src={tasca.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF1EA] text-[22px]">🍻</span>
                  )}
                  <div>
                    <h3 className="text-[18px] font-extrabold">{tasca.name}</h3>
                    <p className="text-[14px] font-semibold text-[#8D7366]">
                      {tasca.zone || "Por confirmar"}
                      {tasca.city ? ` · ${tasca.city}` : ""}
                    </p>
                  </div>
                  {tasca.isFounder && <span className="ml-auto rounded-full bg-[#FFF1EA] px-2 py-1 text-[11px] font-extrabold text-[#FF4F1A]">Tasca fundadora</span>}
                </div>
                <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Premio de la semana</p>
                <p className="mt-1 text-[16px] font-extrabold">{tasca.roundPrize || "Por confirmar"}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {instagram ? (
                    <a href={instagram} className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#FF4F1A]">Instagram</a>
                  ) : (
                    <span className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF7F1] text-[12px] font-extrabold text-[#A08B80]">Instagram</span>
                  )}
                  {whatsapp ? (
                    <a href={whatsapp} className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#FF4F1A]">WhatsApp</a>
                  ) : (
                    <span className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF7F1] text-[12px] font-extrabold text-[#A08B80]">WhatsApp</span>
                  )}
                </div>
                {tasca.slug && (
                  <button
                    type="button"
                    onClick={() => navigate(`/tobo/venue/${tasca.slug}`)}
                    className="mt-2 h-12 w-full rounded-2xl bg-[#241710] text-[14px] font-extrabold text-white"
                  >
                    Ver tasca
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <TabBar />
    </div>
  );
}
