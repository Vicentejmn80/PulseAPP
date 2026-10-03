import { useNavigate } from "react-router-dom";
import { IconCoin } from "@/components/ui/icons";
import { PulseTabBar } from "@/components/ui/PulseTabBar";
import { formato } from "@/lib/format";
import { usePulse } from "@/state/PulseContext";

/** Clear the Tobo intro flag so the brand animation plays on every entry from Pulse. */
function clearToboIntro() {
  sessionStorage.removeItem("tobo-intro-shown");
}

export function PulseHomePage() {
  const navigate = useNavigate();
  const { totalPoints } = usePulse();

  function enterTobo() {
    clearToboIntro();
    navigate("/tobo");
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--p-bg)", color: "var(--p-text)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <div>
          <h1
            className="text-[28px] font-extrabold leading-none tracking-tight"
            style={{ color: "var(--p-text)" }}
          >
            Pulse
          </h1>
          <p
            className="mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.2em]"
            style={{ color: "var(--p-accent)" }}
          >
            Tus experiencias
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5"
          style={{ boxShadow: "0 4px 12px rgba(24,160,133,0.12)" }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--p-accent)" }}
          >
            <IconCoin className="h-4 w-4 text-white" />
          </span>
          <span
            className="text-[13px] font-extrabold tabular-nums"
            style={{ color: "var(--p-text)" }}
          >
            {formato(totalPoints)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Category filter chips */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["Béisbol", "Fútbol", "Tascas", "Premios"].map((chip, i) => (
            <span
              key={chip}
              className="shrink-0 rounded-full px-4 py-2 text-[12px] font-extrabold uppercase tracking-wide"
              style={
                i === 0
                  ? { backgroundColor: "var(--p-accent)", color: "white" }
                  : { backgroundColor: "white", color: "var(--p-muted)" }
              }
            >
              {chip}
            </span>
          ))}
        </div>

        {/* ── Featured: Juégate el Tobo ── */}
        <button
          type="button"
          onClick={enterTobo}
          className="mb-5 w-full overflow-hidden rounded-[28px] text-left"
          style={{ background: "linear-gradient(135deg, #070E1F 0%, #0B1A3C 55%, #132A55 100%)", boxShadow: "0 16px 32px rgba(11,26,60,0.22)" }}
        >
          <div className="p-5">
            <p
              className="text-[10px] font-extrabold uppercase tracking-[0.28em]"
              style={{ color: "#FFC94A" }}
            >
              Experiencia activa · LVBP 2026-27
            </p>
            <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-white">
              Juégate
              <br />
              el Tobo
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-white/65">
              Pronostica, sube en el ranking y gana en tu tasca.
            </p>
            <div
              className="mt-4 flex h-11 items-center justify-center rounded-2xl text-[14px] font-extrabold uppercase tracking-wider"
              style={{ backgroundColor: "#FFC94A", color: "#070E1F" }}
            >
              Entrar →
            </div>
          </div>
        </button>

        {/* ── Cerca de ti (coming soon) ── */}
        <p
          className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: "var(--p-muted)" }}
        >
          Cerca de ti · Pronto
        </p>
        {[
          { title: "El Nacional vs Caracas FC", tag: "Fútbol" },
          { title: "Trivia Premier League",     tag: "Quiz"   },
          { title: "Maracaibo Arena",           tag: "Evento" },
        ].map((card) => (
          <div
            key={card.title}
            className="mb-3 flex items-center gap-3 rounded-[22px] bg-white px-4 py-4 opacity-45"
          >
            <div
              className="h-10 w-10 shrink-0 rounded-2xl"
              style={{ backgroundColor: "var(--p-accent)" }}
            />
            <div>
              <p
                className="text-[14px] font-extrabold"
                style={{ color: "var(--p-text)" }}
              >
                {card.title}
              </p>
              <p
                className="text-[12px] font-semibold"
                style={{ color: "var(--p-muted)" }}
              >
                {card.tag} · Próximamente
              </p>
            </div>
          </div>
        ))}
      </div>

      <PulseTabBar />
    </div>
  );
}
