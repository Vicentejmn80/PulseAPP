import { useLocation, useNavigate } from "react-router-dom";
import { ToboBackHome } from "@/components/tobo/ToboBackHome";
import { isToboTabActive, TOBO_TABS } from "@/lib/toboTabs";

const USE_DESKTOP_SIDENAV = true;

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const atHome = location.pathname === "/tobo";

  return (
    <>
      {USE_DESKTOP_SIDENAV && (
        <aside
          className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[220px] lg:flex-col"
          style={{ backgroundColor: "var(--t-card)", borderRight: "1px solid var(--t-border)" }}
        >
          <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--t-muted)" }}>
              Béisbol Rush LVBP
            </p>
          </div>
          <nav className="mt-4 flex flex-1 flex-col gap-1 px-3 pb-4">
            {TOBO_TABS.map((item) => {
              const on = isToboTabActive(location.pathname, item.to);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className="flex min-h-11 items-center rounded-2xl px-3 text-left text-[14px] font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CFFF00]"
                  style={{
                    backgroundColor: on ? "rgba(207,255,0,0.14)" : "transparent",
                    color: on ? "var(--t-accent)" : "var(--t-text)",
                    border: on ? "1px solid rgba(207,255,0,0.22)" : "1px solid transparent",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      <div className="shrink-0 lg:hidden">
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
    </>
  );
}
