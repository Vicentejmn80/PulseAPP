import { useLocation, useNavigate } from "react-router-dom";

const items = [
  { id: "inicio",   to: "/tobo",              label: "Inicio"     },
  { id: "quiniela", to: "/tobo/mi-quiniela",   label: "Mi Quiniela"},
  { id: "ranking",  to: "/tobo/ranking",       label: "Ranking"    },
  { id: "tascas",   to: "/tobo/tascas",        label: "Tascas"     },
  { id: "perfil",   to: "/tobo/profile",       label: "Perfil"     },
];

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      className="flex h-[74px] shrink-0 items-start justify-around border-t px-1 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]"
      style={{
        borderColor: "var(--t-border)",
        backgroundColor: "var(--t-card)",
      }}
    >
      {items.map((item) => {
        const on =
          item.to === "/tobo"
            ? location.pathname === "/tobo"
            : location.pathname.startsWith(item.to);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex w-16 flex-col items-center"
            style={{ color: on ? "var(--t-accent)" : "var(--t-muted)" }}
          >
            <span className="text-[12px] font-extrabold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
