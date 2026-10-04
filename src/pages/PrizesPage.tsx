import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Trophy } from "lucide-react";
import { BackButton } from "@/components/ui/Buttons";
import { CardHead, GoldCta, ToboCard } from "@/components/tobo/surface";
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
          <ToboCard>
            <CardHead icon={Trophy} title="Premios de esta ronda" />
            <p className="text-[22px] font-extrabold leading-tight">{active ? active.name : "Temporada"}</p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
              {active ? `${active.startsOn} al ${active.endsOn}` : "LVBP 2026-27"}
            </p>
            <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
              Los primeros puestos del ranking ganan premios de las tascas.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[1, 2, 3].map((place) => (
                <PrizePlace key={place} place={place} />
              ))}
            </div>
            <div className="mt-4">
              <GoldCta icon={Trophy} onClick={() => navigate("/tobo/ranking")}>Ver ranking</GoldCta>
            </div>
          </ToboCard>
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
              <ToboCard key={prize.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--t-tint)", color: "var(--t-accent)" }}>
                      <Award className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-[16px] font-extrabold">{prize.cycleName}</p>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Puesto {prize.rank}</p>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-1 text-[11px] font-extrabold"
                    style={{ backgroundColor: "var(--t-tint)", color: "var(--t-accent)" }}
                  >
                    {prize.status === "redeemed" ? "Redimido" : "Disponible"}
                  </span>
                </div>
                <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--t-muted)" }}>Codigo de canje</p>
                <p className="mt-1 text-[28px] font-extrabold uppercase tracking-[0.14em]">{prize.code}</p>
                <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Vence el {prize.expiresAt ? new Date(prize.expiresAt).toLocaleDateString("es-VE") : "Por confirmar"}</p>
              </ToboCard>
            ))}
          </div>
        )}
      </div>
      <TabBar />
    </div>
  );
}

const PLACE_COLOR = ["#FFC94A", "#C5D0E0", "#D08A4A"];

function PrizePlace({ place }: { place: number }) {
  const color = PLACE_COLOR[place - 1] ?? "#FFC94A";
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
      <span className="relative">
        <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${color}22`, color }}>
          <Trophy className="h-6 w-6" />
        </span>
        <span
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold"
          style={{ backgroundColor: color, color: "#0B1A3C" }}
        >
          #{place}
        </span>
      </span>
      <p className="text-center text-[11px] font-extrabold">Puesto {place}</p>
    </div>
  );
}
