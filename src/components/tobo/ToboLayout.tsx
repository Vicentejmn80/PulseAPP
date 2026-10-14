import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScanQrButton } from "@/components/tobo/ScanQrButton";
import { LVBP_EXPERIENCE_TITLE } from "@/config/lvbpBrand";
import { toboExitTarget } from "@/lib/toboNav";
import { CategoryTransition } from "./CategoryTransition";
import { InstallBanner } from "./InstallBanner";
import { LeagueInviteInbox } from "./LeagueInvite";
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
      className="relative flex min-h-[100dvh] w-full flex-col lg:pl-[220px]"
      style={{ backgroundColor: "var(--t-bg)", color: "var(--t-text)" }}
    >
      <div className="mx-auto flex w-full min-h-[100dvh] flex-col lg:max-w-[1200px]">
        {/* Phase 5: Back-to-Pulse persistent bar */}
        <div
          className="flex shrink-0 items-center justify-between px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 lg:px-8"
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
          <ScanQrButton onClick={() => navigate("/tobo/escanear")} />
          <span
            className="max-w-[48%] truncate text-right text-[9px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--t-muted)" }}
          >
            {LVBP_EXPERIENCE_TITLE}
          </span>
        </div>
        <InstallBanner />
        <div className="px-4 sm:px-6 lg:px-8">
          <LeagueInviteInbox />
        </div>

        {!atHome && (
          <div className="shrink-0 px-4 pb-2 pt-2 sm:px-6 lg:px-8">
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
    </div>
  );
}
