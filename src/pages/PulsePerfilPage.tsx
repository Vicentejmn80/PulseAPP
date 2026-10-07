import { PulseTabBar } from "@/components/ui/PulseTabBar";
import { formato } from "@/lib/format";
import { usePulse } from "@/state/PulseContext";

export function PulsePerfilPage() {
  const { currentUser, totalPoints, logout } = usePulse();

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--p-bg)", color: "var(--p-text)" }}
    >
      {/* Header */}
      <div className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <p
          className="text-[11px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: "var(--p-accent)" }}
        >
          Rusher
        </p>
        <h1 className="mt-0.5 text-[26px] font-extrabold leading-none tracking-tight">
          Perfil
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Avatar + name */}
        <div
          className="mb-4 rounded-[28px] px-5 py-6"
          style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[22px] font-extrabold text-white"
              style={{ backgroundColor: currentUser.avatarColor ?? "var(--p-accent)" }}
            >
              {currentUser.initials}
            </div>
            <div>
              <p className="text-[20px] font-extrabold leading-tight">{currentUser.alias}</p>
              <p className="text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
                {currentUser.handle}
                {currentUser.city ? ` · ${currentUser.city}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Points */}
        <div
          className="mb-4 rounded-[24px] px-5 py-5"
          style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}
        >
          <p
            className="text-[11px] font-extrabold uppercase tracking-[0.18em]"
            style={{ color: "var(--p-accent)" }}
          >
            Puntos totales
          </p>
          <p className="mt-1 text-[36px] font-extrabold leading-none tabular-nums">
            {formato(totalPoints)}
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
            en Rusher
          </p>
        </div>

        {/* Access code */}
        <div
          className="mb-4 rounded-[24px] px-5 py-5"
          style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}
        >
          <p
            className="text-[11px] font-extrabold uppercase tracking-[0.18em]"
            style={{ color: "var(--p-accent)" }}
          >
            Tu celular
          </p>
          <p className="mt-1 text-[22px] font-extrabold tracking-tight">
            {currentUser.phone || "WhatsApp"}
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
            Entras con tu celular y tu PIN. El PIN no se muestra aquí.
          </p>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={logout}
          className="mt-2 w-full text-center text-[14px] font-extrabold"
          style={{ color: "#E23B2F" }}
        >
          Cerrar sesión en este teléfono
        </button>
      </div>

      <PulseTabBar />
    </div>
  );
}
