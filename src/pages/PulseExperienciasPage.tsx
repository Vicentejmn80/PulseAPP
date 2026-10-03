import { useNavigate } from "react-router-dom";
import { PulseTabBar } from "@/components/ui/PulseTabBar";
import { formato } from "@/lib/format";
import { usePulse } from "@/state/PulseContext";

function clearToboIntro() {
  sessionStorage.removeItem("tobo-intro-shown");
}

const COMING_SOON = [
  { label: "Fútbol",     emoji: "⚽",  tag: "Muy pronto" },
  { label: "Baloncesto", emoji: "🏀",  tag: "Muy pronto" },
  { label: "Quiz",       emoji: "🧠",  tag: "Muy pronto" },
];

export function PulseExperienciasPage() {
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
      <div className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <p
          className="text-[11px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: "var(--p-accent)" }}
        >
          Pulse
        </p>
        <h1 className="mt-0.5 text-[26px] font-extrabold leading-none tracking-tight">
          Experiencias
        </h1>
        <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
          Elige tu experiencia y juega. Tus puntos: {formato(totalPoints)}.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* ACTIVE: Juégate el Tobo */}
        <p
          className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: "var(--p-accent)" }}
        >
          Activa ahora
        </p>
        <button
          type="button"
          onClick={enterTobo}
          className="mb-5 w-full overflow-hidden rounded-[28px] text-left"
          style={{
            background: "linear-gradient(135deg, #070E1F 0%, #0B1A3C 55%, #132A55 100%)",
            boxShadow: "0 16px 32px rgba(11,26,60,0.22)",
          }}
        >
          <div className="p-5">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em]"
              style={{ backgroundColor: "rgba(255,201,74,0.18)", color: "#FFC94A" }}
            >
              ⚾ LVBP 2026-27
            </span>
            <h2 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight text-white">
              Juégate el Tobo
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-white/65">
              Pronostica partidos, compite en el ranking y gana premios en tu tasca.
            </p>
            <div
              className="mt-4 flex h-11 items-center justify-center rounded-2xl text-[14px] font-extrabold uppercase tracking-wider"
              style={{ backgroundColor: "#FFC94A", color: "#070E1F" }}
            >
              Entrar →
            </div>
          </div>
        </button>

        {/* COMING SOON */}
        <p
          className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: "var(--p-muted)" }}
        >
          Próximamente
        </p>
        {COMING_SOON.map((exp) => (
          <div
            key={exp.label}
            className="mb-3 flex items-center gap-4 rounded-[22px] bg-white px-5 py-4 opacity-40"
          >
            <span className="text-[28px]">{exp.emoji}</span>
            <div>
              <p className="text-[16px] font-extrabold" style={{ color: "var(--p-text)" }}>
                {exp.label}
              </p>
              <p className="text-[12px] font-semibold" style={{ color: "var(--p-muted)" }}>
                {exp.tag}
              </p>
            </div>
          </div>
        ))}
      </div>

      <PulseTabBar />
    </div>
  );
}
