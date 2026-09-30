import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TabBar } from "@/components/ui/TabBar";
import { venueQrPath } from "@/lib/demoMatch";
import { listTascas, type Tasca } from "@/services/matchesApi";

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" });
}

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
  const [error, setError] = useState("");
  const [scanHint, setScanHint] = useState("");

  useEffect(() => {
    let alive = true;
    listTascas()
      .then((rows) => {
        if (alive) setTascas(rows);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las tascas.");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Tascas participantes</h2>
        <p className="text-[13px] font-semibold text-[#8D7366]">La red aliada del piloto. Aquí se vive el juego y se canjea el tobo.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {tascas.length === 0 && !error && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">Las tascas fundadoras se publican aquí</p>
            <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Cuando administración cargue una tasca, vas a ver su zona, contacto y si es fundadora.</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {tascas.map((tasca) => {
            const instagram = externalHref("instagram", tasca.instagram || "");
            const whatsapp = externalHref("whatsapp", tasca.whatsapp || "");
            const games = tasca.gamesAiring ?? [];
            return (
              <article key={tasca.id} className="rounded-[24px] bg-white px-4 py-4">
                <div className="flex items-start gap-3">
                  {tasca.logoUrl ? <img src={tasca.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF1EA] text-[22px]">🍻</span>}
                  <div>
                    <h3 className="text-[18px] font-extrabold">{tasca.name}</h3>
                    <p className="text-[14px] font-semibold text-[#8D7366]">{tasca.zone || "Por confirmar"}{tasca.city ? ` · ${tasca.city}` : ""}</p>
                  </div>
                  {tasca.isFounder && <span className="ml-auto rounded-full bg-[#FFF1EA] px-2 py-1 text-[11px] font-extrabold text-[#FF4F1A]">Tasca fundadora</span>}
                </div>
                <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Premio</p>
                <p className="mt-1 text-[16px] font-extrabold">{tasca.roundPrize || "Por confirmar"}</p>
                <p className="mt-1 text-[12px] font-extrabold text-[#FF4F1A]">{tasca.active === false ? "Inactiva" : "Activa"}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {instagram ? (
                    <a href={instagram} className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#FF4F1A]">Instagram</a>
                  ) : (
                    <span className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF7F1] text-[12px] font-extrabold text-[#A08B80]">Instagram · Por confirmar</span>
                  )}
                  {whatsapp ? (
                    <a href={whatsapp} className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#FF4F1A]">WhatsApp</a>
                  ) : (
                    <span className="flex h-11 items-center justify-center rounded-2xl bg-[#FFF7F1] text-[12px] font-extrabold text-[#A08B80]">WhatsApp · Por confirmar</span>
                  )}
                </div>
                <p className="mt-4 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Transmite hoy</p>
                {games.length === 0 && <p className="mt-1 text-[14px] font-semibold text-[#8D7366]">{tasca.broadcasts || "Todavía no publicó su programación."}</p>}
                {games.map((game) => (
                  <p key={game.id} className="mt-1 text-[14px] font-extrabold">{game.awayTeam} vs {game.homeTeam} · {when(game.startsAt)}</p>
                ))}
                <p className="mt-4 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Premio de la ronda</p>
                <p className="mt-1 text-[16px] font-extrabold">{tasca.roundPrize || "Por confirmar"}</p>
                <button type="button" onClick={() => setScanHint(tasca.id)} className="mt-4 h-12 w-full rounded-2xl bg-[#FFF1EA] text-[14px] font-extrabold text-[#FF4F1A]">
                  Escanear QR en el local
                </button>
                {tasca.slug && (
                  <button type="button" onClick={() => navigate(venueQrPath(tasca.slug ?? ""))} className="mt-2 h-12 w-full rounded-2xl bg-[#241710] text-[14px] font-extrabold text-white">
                    Ver tasca
                  </button>
                )}
                {scanHint === tasca.id && <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Apunta la cámara al código de esta tasca. El cartel está en el local.</p>}
              </article>
            );
          })}
        </div>
      </div>
      <TabBar />
    </div>
  );
}
