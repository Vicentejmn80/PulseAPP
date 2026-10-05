import { useNavigate } from "react-router-dom";

export function FounderBanner() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/tobo/tascas")}
      className="relative w-full overflow-hidden rounded-[20px] text-left"
      style={{ background: "linear-gradient(165deg, #132652 0%, #0B1A3C 55%, #060B1E 100%)", minHeight: 168 }}
    >
      <span
        className="absolute left-[-28px] top-3 rotate-[-8deg] bg-[#FFC94A] px-10 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#060B1E]"
      >
        Fundadoras
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-[#060B1E]/55 px-2.5 py-1 text-[11px] font-extrabold text-[#FFE39B]">
        9 tascas activas
      </span>
      <span className="relative flex min-h-[168px] flex-col justify-end gap-2 px-4 pb-4 pt-12">
        <span className="text-[22px] font-extrabold uppercase leading-none text-white">Las tascas donde se vive el Tobo</span>
        <span className="max-w-[90%] text-[12px] font-semibold leading-snug text-[#FFE39B]">
          Cada una tiene su ranking, su premio y su gente. Encuentra la más cerca de ti.
        </span>
        <span className="mt-1 inline-flex w-max rounded-full bg-[#FFC94A] px-4 py-2 text-[12px] font-extrabold text-[#060B1E]">
          Ver más →
        </span>
      </span>
    </button>
  );
}
