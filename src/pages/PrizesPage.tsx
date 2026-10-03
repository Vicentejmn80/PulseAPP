import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { TabBar } from "@/components/ui/TabBar";
import { listCycles, myPrizes, type ToboCycle, type ToboPrize } from "@/services/matchesApi";

type PrizeTab = "disponibles" | "ganados" | "redimidos";

export function PrizesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<PrizeTab>("disponibles");
  const [prizes, setPrizes] = useState<ToboPrize[]>([]);
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([myPrizes(), listCycles()])
      .then(([prizeStatus, cycleRows]) => {
        if (alive) {
          setPrizes(prizeStatus.prizes ?? []);
          setCycles(cycleRows);
        }
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los premios.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const active = cycles.find((c) => c.status === "open") ?? cycles[0];
  const won = prizes.filter((p) => p.status !== "redeemed");
  const redeemed = prizes.filter((p) => p.status === "redeemed");

  const displayed = tab === "disponibles" ? [] : tab === "ganados" ? won : redeemed;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/tobo/tascas")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Premios</h2>
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="grid grid-cols-3 gap-1">
          {(["disponibles", "ganados", "redimidos"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-11 rounded-2xl text-[12px] font-extrabold ${tab === t ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"}`}
            >
              {t === "disponibles" ? "Disponibles" : t === "ganados" ? "Ganados" : "Redimidos"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        {tab === "disponibles" && (
          <div className="rounded-[28px] bg-gradient-to-br from-[#FF8A3C] via-[#FF4F1A] to-[#E8360C] p-5 text-white shadow-[0_16px_32px_rgba(255,79,26,0.28)]">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/80">Ciclo activo</p>
            <p className="mt-1 text-[20px] font-extrabold">{active ? active.name : "Temporada"}</p>
            <p className="text-[14px] font-semibold text-white/80">{active ? `${active.startsOn} al ${active.endsOn}` : "LVBP 2026-27"}</p>
            <p className="mt-4 text-[14px] font-semibold text-white/90">
              Los primeros puestos del ranking ganan premios de las tascas. Cierra el ciclo y revisa tu codigo de canje.
            </p>
            <button
              type="button"
              onClick={() => navigate("/tobo/ranking")}
              className="mt-4 h-12 w-full rounded-2xl bg-white text-[16px] font-extrabold text-[#FF4F1A]"
            >
              Ver ranking
            </button>
          </div>
        )}

        {tab !== "disponibles" && displayed.length === 0 && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">No tienes premios {tab === "ganados" ? "ganados" : "redimidos"}</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
              {tab === "ganados" ? "Sigue pronosticando y subiendo en el ranking." : "Cuando canjees un premio, aparecera aqui."}
            </p>
          </div>
        )}

        {tab !== "disponibles" && (
          <div className="flex flex-col gap-2">
            {displayed.map((prize) => (
              <div key={prize.id} className="rounded-[24px] bg-white px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-[16px] font-extrabold">{prize.cycleName}</p>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${
                      prize.status === "redeemed" ? "bg-[#F3E4D8] text-[#8D7366]" : "bg-[#FFF1EA] text-[#FF4F1A]"
                    }`}
                  >
                    {prize.status === "redeemed" ? "Redimido" : "Disponible"}
                  </span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Puesto {prize.rank}</p>
                <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Codigo de canje</p>
                <p className="mt-1 text-[28px] font-extrabold uppercase tracking-[0.14em]">{prize.code}</p>
                <p className="text-[13px] font-semibold text-[#8D7366]">Vence el {prize.expiresAt ? new Date(prize.expiresAt).toLocaleDateString("es-VE") : "Por confirmar"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <TabBar />
    </div>
  );
}
