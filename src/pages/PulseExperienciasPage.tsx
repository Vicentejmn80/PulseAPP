import { useNavigate } from "react-router-dom";
import { PulseTabBar } from "@/components/ui/PulseTabBar";
import { usePulse } from "@/state/PulseContext";

function clearToboIntro() {
  sessionStorage.removeItem("tobo-intro-shown");
}

export function PulseExperienciasPage() {
  const navigate = useNavigate();
  const { totalPoints } = usePulse();

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--p-bg)", color: "var(--p-text)" }}>
      <div className="px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "var(--p-accent)" }}>
          Rusher
        </p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-none">Experiencias</h1>
        <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
          ⚡ {totalPoints} pts
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-3 px-1 text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--p-muted)" }}>
          Experiencias disponibles
        </p>
        <button
          type="button"
          onClick={() => {
            clearToboIntro();
            navigate("/tobo");
          }}
          className="w-full rounded-[24px] px-5 py-5 text-left"
          style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}
        >
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--p-accent)" }}>
            Activa
          </p>
          <h2 className="mt-2 text-[24px] font-extrabold">Júgate el Tobo</h2>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
            Pronostica, compite y gana en tu tasca.
          </p>
        </button>
        <p className="mt-8 px-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
          Más Rushes están por llegar.
        </p>
      </div>
      <PulseTabBar />
    </div>
  );
}
