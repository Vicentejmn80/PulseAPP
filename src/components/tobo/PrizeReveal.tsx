import { useEffect } from "react";
import { Trophy } from "lucide-react";
import { GoldCta } from "@/components/tobo/surface";
import { markPrizeSeen, type ToboPrize } from "@/services/matchesApi";

export function PrizeReveal({ prize, onOpen }: { prize: ToboPrize; onOpen: () => void }) {
  useEffect(() => {
    void markPrizeSeen(prize.id).catch(() => undefined);
  }, [prize.id]);

  return (
    <div className="flex h-full flex-col justify-center px-5 pb-8">
      <div
        className="rounded-[24px] px-5 py-8 text-center shadow-[0_16px_36px_rgba(0,0,0,0.35)]"
        style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
      >
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--t-tint)", color: "var(--t-accent)" }}
        >
          <Trophy className="h-8 w-8" />
        </span>
        <p className="mt-4 text-[12px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--t-accent)" }}>
          Juégate el Tobo
        </p>
        <h1 className="mt-2 text-[34px] font-extrabold leading-none">¡Ganaste!</h1>
        <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--t-muted)" }}>
          Puesto #{prize.rank} en {prize.cycleName}
        </p>
        <p className="mt-4 text-[22px] font-extrabold">{prize.prizeName || "Tobo de cerveza"}</p>
        <div className="mt-6">
          <GoldCta icon={Trophy} onClick={onOpen}>Ver cómo canjearlo</GoldCta>
        </div>
      </div>
    </div>
  );
}
