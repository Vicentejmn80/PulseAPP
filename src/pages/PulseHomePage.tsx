import { useNavigate } from "react-router-dom";
import { PulseTabBar } from "@/components/ui/PulseTabBar";
import { RusherMark } from "@/components/ui/RusherMark";
import { formato } from "@/lib/format";
import { usePulse } from "@/state/PulseContext";

function clearToboIntro() {
  sessionStorage.removeItem("tobo-intro-shown");
}

export function PulseHomePage() {
  const navigate = useNavigate();
  const { totalPoints, currentUser } = usePulse();

  function enterTobo() {
    clearToboIntro();
    navigate("/tobo");
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--p-bg)", color: "var(--p-text)" }}>
      <nav
        className="flex items-center justify-between px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]"
        aria-label="Rusher"
      >
        <div className="flex items-center gap-2">
          <RusherMark size={36} variant="header" />
          <p className="text-[15px] font-extrabold tracking-[0.18em]" style={{ color: "var(--p-accent)" }}>
            RUSHER
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1.5 text-[13px] font-extrabold tabular-nums" style={{ backgroundColor: "var(--p-card)", color: "var(--p-accent)" }}>
            ⚡ {formato(totalPoints)} pts
          </span>
          <button
            type="button"
            onClick={() => navigate("/perfil")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-extrabold text-[#0B0D0F]"
            style={{ backgroundColor: "var(--p-accent)" }}
            aria-label="Perfil"
          >
            {currentUser.initials?.slice(0, 1) || "R"}
          </button>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <p className="px-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
          ¿Qué Rush hay aquí?
        </p>

        <button
          type="button"
          onClick={enterTobo}
          className="mt-4 w-full overflow-hidden rounded-[28px] text-left"
          style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}
        >
          <div className="px-5 pb-5 pt-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "var(--p-accent)" }}>
              Experiencia activa
            </p>
            <h2 className="mt-3 text-[32px] font-extrabold leading-none tracking-tight">Júgate el Tobo</h2>
            <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
              Una experiencia de Rusher.
            </p>
            <p className="mt-3 text-[15px] font-semibold leading-snug">
              Pronostica, acumula puntos y gana en tu tasca.
            </p>
            <div
              className="mt-5 flex h-12 items-center justify-center rounded-2xl text-[15px] font-extrabold tracking-wide text-[#0B0D0F]"
              style={{ backgroundColor: "#C8FF00" }}
            >
              ENTRAR →
            </div>
          </div>
        </button>

        <p className="mt-8 px-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
          Más Rushes están por llegar.
        </p>
      </div>
      <PulseTabBar />
    </div>
  );
}
