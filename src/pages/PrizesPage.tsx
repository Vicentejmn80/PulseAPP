import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, MapPin, Ticket, Trophy } from "lucide-react";
import { CardHead, ToboCard } from "@/components/tobo/surface";
import { TabBar } from "@/components/ui/TabBar";
import { mapsQuery, voucherDaysLeft, voucherLabel, voucherStatus } from "@/lib/prizeWallet";
import { listTascas, myPrizes, type Tasca, type ToboPrize } from "@/services/matchesApi";

export function PrizesPage() {
  const navigate = useNavigate();
  const [prizes, setPrizes] = useState<ToboPrize[]>([]);
  const [tascas, setTascas] = useState<Tasca[]>([]);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([myPrizes(), listTascas()])
      .then(([prizeStatus, venues]) => {
        if (!alive) return;
        setPrizes(prizeStatus.prizes ?? []);
        setTascas(venues);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los premios.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const founders = tascas.filter((tasca) => tasca.isFounder && tasca.active !== false);
  const counters = founders.length > 0 ? founders : tascas.filter((tasca) => tasca.roundPrize && tasca.roundPrize !== "Por confirmar");

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      setCopied("");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-3">
        <button type="button" onClick={() => navigate("/tobo")} className="text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>
          ← Inicio
        </button>
        <h2 className="mt-1 text-[26px] font-extrabold tracking-tight">Mis premios</h2>
        <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
          Muestra el código en la tasca. Sirve en cualquiera de la lista.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {error && <p className="rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>{error}</p>}
        {prizes.length === 0 && !error && (
          <ToboCard>
            <CardHead icon={Trophy} title="Billetera" />
            <p className="text-[15px] font-extrabold">Todavía no tienes premios.</p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
              Cuando cierres una ronda entre los primeros, el código aparece aquí.
            </p>
          </ToboCard>
        )}
        {prizes.map((prize) => {
          const status = voucherStatus(prize.status, prize.expiresAt);
          const days = prize.daysLeft ?? voucherDaysLeft(prize.expiresAt);
          const active = status === "assigned";
          return (
            <ToboCard key={prize.id}>
              <CardHead icon={Ticket} title={prize.cycleName || "Ronda"} />
              <p className="text-[18px] font-extrabold">{prize.prizeName || "Tobo de cerveza"}</p>
              <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Puesto #{prize.rank}</p>
              <p
                className="mt-4 text-center text-[32px] font-extrabold tracking-[0.18em]"
                style={{ color: active ? "var(--t-accent)" : "var(--t-muted)" }}
              >
                {prize.code}
              </p>
              <button
                type="button"
                onClick={() => void copyCode(prize.code)}
                className="mx-auto mt-2 flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-extrabold"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid var(--t-border)" }}
              >
                {copied === prize.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === prize.code ? "Copiado" : "Copiar código"}
              </button>
              <p className="mt-3 text-center text-[13px] font-extrabold" style={{ color: active ? "var(--t-accent)" : "var(--t-muted)" }}>
                {voucherLabel(status, days)}
              </p>
              {active && (
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-muted)" }}>
                    Canjéalo en estas tascas
                  </p>
                  {counters.length === 0 && (
                    <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Las tascas participantes se publican aquí.</p>
                  )}
                  {counters.map((tasca) => {
                    const maps = mapsQuery(tasca);
                    return (
                      <div key={tasca.id} className="rounded-2xl px-3 py-3" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid var(--t-border)" }}>
                        <p className="text-[14px] font-extrabold">{tasca.name}</p>
                        <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--t-muted)" }}>
                          {[tasca.address, tasca.zone, tasca.city].filter((part) => part && part !== "Por confirmar").join(" · ") || "Dirección por confirmar"}
                        </p>
                        {maps && (
                          <a
                            href={maps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-extrabold"
                            style={{ color: "var(--t-accent)" }}
                          >
                            <MapPin className="h-4 w-4" />
                            Abrir en Google Maps
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ToboCard>
          );
        })}
      </div>
      <TabBar />
    </div>
  );
}
