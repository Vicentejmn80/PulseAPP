import { PulseTabBar } from "@/components/ui/PulseTabBar";
import { formato } from "@/lib/format";
import { usePulse } from "@/state/PulseContext";

export function PulsePremiosPage() {
  const { totalPoints } = usePulse();

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--p-bg)", color: "var(--p-text)" }}
    >
      {/* Header */}
      <div className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <p
          className="text-[11px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: "var(--p-accent)" }}
        >
          Rusher
        </p>
        <h1 className="mt-0.5 text-[26px] font-extrabold leading-none tracking-tight">
          Premios
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Points summary */}
        <div
          className="mb-4 rounded-[24px] px-5 py-5 text-center"
          style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}
        >
          <p
            className="text-[11px] font-extrabold uppercase tracking-[0.2em]"
            style={{ color: "var(--p-accent)" }}
          >
            Tus puntos
          </p>
          <p className="mt-2 text-[42px] font-extrabold leading-none tabular-nums">
            {formato(totalPoints)}
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
            acumulados en todas las experiencias
          </p>
        </div>

        {/* Empty state */}
        <div
          className="rounded-[28px] px-6 py-10 text-center"
          style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}
        >
          <span className="text-[40px]">🏆</span>
          <p className="mt-4 text-[18px] font-extrabold" style={{ color: "var(--p-text)" }}>
            Todavía no hay un premio
          </p>
          <p
            className="mt-2 text-[14px] font-semibold leading-snug"
            style={{ color: "var(--p-muted)" }}
          >
            Cuando ganes en una experiencia, el premio aparece aquí. Canjeable en una tasca afiliada.
          </p>
        </div>

        {/* Hint */}
        <p
          className="mt-5 text-center text-[12px] font-semibold"
          style={{ color: "var(--p-muted)" }}
        >
          Júgate el Tobo es la experiencia activa. Entra, suma puntos y compite por el premio de la ronda.
        </p>
      </div>

      <PulseTabBar />
    </div>
  );
}
