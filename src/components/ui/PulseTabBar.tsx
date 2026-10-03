import { useLocation, useNavigate } from "react-router-dom";

const items = [
  { id: "inicio",       to: "/",             label: "Inicio"       },
  { id: "experiencias", to: "/tobo",          label: "Experiencias" },
  { id: "premios",      to: "/tobo/premios",  label: "Premios"      },
  { id: "perfil",       to: "/tobo/profile",  label: "Perfil"       },
];

export function PulseTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      className="flex h-[74px] shrink-0 items-start justify-around border-t px-1 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] bg-white"
      style={{ borderColor: "rgba(24,160,133,0.18)" }}
    >
      {items.map((item) => {
        const on =
          item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex w-16 flex-col items-center"
            style={{ color: on ? "var(--p-accent)" : "var(--p-muted)" }}
          >
            <span className="text-[12px] font-extrabold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
