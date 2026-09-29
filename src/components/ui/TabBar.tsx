import { useLocation, useNavigate } from "react-router-dom";

const items = [
  { id: "inicio", to: "/", label: "Inicio" },
  { id: "partidos", to: "/partidos", label: "Partidos" },
  { id: "ranking", to: "/ranking", label: "Ranking" },
  { id: "tascas", to: "/tascas", label: "Tascas" },
  { id: "perfil", to: "/profile", label: "Perfil" },
];

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex h-[74px] shrink-0 items-start justify-around border-t border-[#F3E4D8] bg-white px-1 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
      {items.map((item) => {
        const on = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.to)}
            className={`flex w-16 flex-col items-center ${on ? "text-[#FF4F1A]" : "text-[#B6A297]"}`}
          >
            <span className="text-[12px] font-extrabold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
