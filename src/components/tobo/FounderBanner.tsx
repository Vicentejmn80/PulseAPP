import { useNavigate } from "react-router-dom";

export function FounderBanner() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/tobo/tascas")}
      className="relative w-full overflow-hidden rounded-[20px] text-left"
      style={{ background: "linear-gradient(165deg, #1B1F22 0%, #14171A 55%, #0B0D0F 100%)", minHeight: 168, border: "1px solid #2A2F33" }}
    >
      <span
        className="absolute left-[-28px] top-3 rotate-[-8deg] bg-[#C8FF00] px-10 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#0B0D0F]"
      >
        Fundadoras
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-[#0B0D0F]/70 px-2.5 py-1 text-[11px] font-extrabold text-[#C8FF00]">
        1 tasca participante
      </span>
      <span className="relative flex min-h-[168px] flex-col justify-end gap-2 px-4 pb-4 pt-12">
        <span className="text-[22px] font-extrabold uppercase leading-none text-white">Vive el Tobo en La Europea Beethoven</span>
        <span className="max-w-[90%] text-[12px] font-semibold leading-snug text-[#9BA1A6]">
          Conoce su ficha, el premio de la ronda y la experiencia con QR.
        </span>
        <span className="mt-1 inline-flex w-max rounded-full bg-[#C8FF00] px-4 py-2 text-[12px] font-extrabold text-[#0B0D0F]">
          Ver más →
        </span>
      </span>
    </button>
  );
}
