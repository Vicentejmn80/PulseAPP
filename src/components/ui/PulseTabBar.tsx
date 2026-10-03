import { useLocation, useNavigate } from "react-router-dom";

/** NavBar exclusivo de la capa Pulse.
 *  Ningún botón apunta a rutas /tobo — esas son de ToboTabBar. */
const items = [
  { id: "inicio",       to: "/",               label: "Inicio"       },
  { id: "experiencias", to: "/experiencias",    label: "Experiencias" },
  { id: "premios",      to: "/premios",         label: "Premios"      },
  { id: "perfil",       to: "/perfil",          label: "Perfil"       },
];

export function PulseTabBar() {
  const location = useLocation();
  const navigate  = useNavigate();

  return (
    <div
      className="flex h-[74px] shrink-0 items-start justify-around border-t bg-white px-1 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]"
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
