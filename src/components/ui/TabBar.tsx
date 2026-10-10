import { useLocation, useNavigate } from "react-router-dom";
import { ToboBackHome } from "@/components/tobo/ToboBackHome";
import { isToboTabActive, TOBO_TABS } from "@/lib/toboTabs";

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const atHome = location.pathname === "/tobo";

  return (
    <div className="shrink-0">
      {!atHome && (
        <div className="px-4 pb-2 pt-2">
          <ToboBackHome />
        </div>
      )}
    <div
      className="flex h-[74px] shrink-0 items-start justify-around border-t px-1 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]"
      style={{
        borderColor: "var(--t-border)",
        backgroundColor: "var(--t-card)",
      }}
    >
      {TOBO_TABS.map((item) => {
        const on = isToboTabActive(location.pathname, item.to);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex min-w-0 flex-1 flex-col items-center px-0.5 text-center"
            style={{ color: on ? "var(--t-accent)" : "var(--t-muted)" }}
          >
            <span className="text-[11px] font-extrabold leading-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
    </div>
  );
}
