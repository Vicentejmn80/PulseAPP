import { useLocation, useNavigate } from "react-router-dom";
import { IconMedal, IconTrophy } from "./icons";

const items = [
  {
    id: "home",
    to: "/",
    label: "Descubre",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M14.8 9.2l-1.2 4.4-4.4 1.2 1.2-4.4 4.4-1.2z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  { id: "retos", to: "/challenges", label: "Retos", icon: <IconTrophy className="h-[22px] w-[22px]" /> },
  { id: "ranking", to: "/ranking", label: "Ranking", icon: <IconMedal className="h-[22px] w-[22px]" /> },
  {
    id: "perfil",
    to: "/profile",
    label: "Perfil",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.2 19.2c.8-3 3.4-4.8 6.8-4.8s6 1.8 6.8 4.8" />
      </svg>
    ),
  },
];

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex h-[78px] shrink-0 items-start justify-around border-t border-[#F3E4D8] bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {items.map((item) => {
        const on =
          item.to === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.to);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.to)}
            className={`flex w-16 flex-col items-center gap-0.5 ${on ? "text-[#FF4F1A]" : "text-[#B6A297]"}`}
          >
            {item.icon}
            <span className="text-[10px] font-bold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
