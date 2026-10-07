import { Outlet, useNavigate } from "react-router-dom";
import { toboExitTarget } from "@/lib/toboNav";
import { CategoryTransition } from "./CategoryTransition";

export function ToboLayout() {
  const navigate = useNavigate();

  return (
    <div
      data-theme="tobo"
      className="flex h-full flex-col"
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
          aria-label="Salir de Juégate el Tobo"
          className="flex items-center gap-1.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: "var(--t-accent)" }}
        >
          ← Rusher
        </button>
        <span
          className="text-[10px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: "var(--t-muted)" }}
        >
          Júgate el Tobo
        </span>
      </div>

      {/* Phase 4: Entry brand animation */}
      <CategoryTransition />

      {/* Routed page content */}
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
