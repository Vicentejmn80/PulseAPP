import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { LVBP_EXPERIENCE_TITLE } from "@/config/lvbpBrand";
import { toboExitTarget } from "@/lib/toboNav";
import { CategoryTransition } from "./CategoryTransition";
import { InstallBanner } from "./InstallBanner";
import { RetoSheetHost } from "./RetoSheet";
import { RetosIntro } from "./RetosIntro";
import { ToboBackHome } from "./ToboBackHome";
import { ToboOnboarding } from "./ToboOnboarding";

export function ToboLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const atHome = location.pathname === "/tobo";

  return (
    <div
      data-theme="tobo"
      className="relative flex h-full flex-col"
      style={{ backgroundColor: "var(--t-bg)", color: "var(--t-text)" }}
    >
      {/* Phase 5: Back-to-Pulse persistent bar */}
      <div
        className="flex shrink-0 items-center justify-between px-5 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]"
        style={{ borderBottom: "1px solid var(--t-border)" }}
      >
        <button
          type="button"
          onClick={() => navigate(toboExitTarget())}
          aria-label={`Salir de ${LVBP_EXPERIENCE_TITLE}`}
          className="flex items-center gap-1.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: "var(--t-accent)" }}
        >
          ← Rusher
        </button>
        <span
          className="max-w-[48%] truncate text-right text-[9px] font-extrabold uppercase tracking-[0.12em]"
          style={{ color: "var(--t-muted)" }}
        >
          {LVBP_EXPERIENCE_TITLE}
        </span>
      </div>
      <InstallBanner />

      {!atHome && (
        <div className="shrink-0 px-4 pb-2 pt-2">
          <ToboBackHome />
        </div>
      )}

      {/* Phase 4: Entry brand animation */}
      <CategoryTransition />

      {/* Routed page content */}
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
      <ToboOnboarding />
      <RetosIntro />
      <RetoSheetHost />
    </div>
  );
}
