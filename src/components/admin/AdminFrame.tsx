import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  Shield,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import type { AdminFailure } from "@/lib/adminConsole";
import { adminCall, type Overview } from "@/services/adminConsoleApi";

const theme = {
  "--adm-bg": "#090B0D",
  "--adm-card": "#12161A",
  "--adm-ink": "#F4F6FA",
  "--adm-muted": "#8B93A5",
  "--adm-accent": "#C6FF3D",
  "--adm-cyan": "#38E1FF",
  "--adm-pink": "#FF4D8D",
  "--adm-amber": "#FFB020",
  "--adm-violet": "#9B7BFF",
  "--adm-wa": "#25D366",
  "--adm-line": "#2A2F33",
} as CSSProperties;

const NAV = [
  { to: "/admin", label: "Resumen", hint: "Qué está pasando", icon: LayoutDashboard, end: true, operator: false },
  { to: "/admin/usuarios", label: "Usuarios", hint: "Cuentas y contacto", icon: Users, operator: true },
  { to: "/admin/beisbol", label: "Resultados", hint: "Marcadores y liquidación", icon: ClipboardList, operator: true },
  { to: "/admin/clasificacion", label: "Tabla LVBP", hint: "Equipos, no jugadores", icon: Trophy, operator: false },
  { to: "/admin/aliados", label: "Aliados", hint: "Locales y campañas", icon: MapPin, operator: false },
  { to: "/admin/movimientos", label: "Movimientos", hint: "Puntos y auditoría", icon: Wallet, operator: false },
  { to: "/admin/equipo", label: "Accesos", hint: "Quién administra", icon: Shield, operator: false },
];

const TITLES: Record<string, string> = {
  "/admin": "Resumen",
  "/admin/usuarios": "Usuarios",
  "/admin/beisbol": "Resultados",
  "/admin/clasificacion": "Tabla LVBP",
  "/admin/aliados": "Aliados y QR",
  "/admin/movimientos": "Movimientos",
  "/admin/equipo": "Accesos",
};

export function AdminConsole() {
  const navigate = useNavigate();
  const location = useLocation();
  const title = TITLES[location.pathname] ?? "Administración";
  const [role, setRole] = useState<"super" | "operator">("super");
  const [newUsers, setNewUsers] = useState(0);
  const items = NAV.filter((item) => role === "super" || item.operator);

  useEffect(() => {
    let alive = true;
    adminCall<{ role?: string }>("admin-whoami")
      .then((result) => {
        if (alive) setRole(result.role === "operator" ? "operator" : "super");
      })
      .catch(() => {
        if (alive) setRole("super");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (role !== "super") return;
    let alive = true;
    adminCall<Overview>("pulse_admin_overview")
      .then((data) => {
        if (alive) setNewUsers(data.usersToday ?? 0);
      })
      .catch(() => {
        if (alive) setNewUsers(0);
      });
    return () => {
      alive = false;
    };
  }, [role]);

  return (
    <div style={theme} className="min-h-[100dvh] bg-[var(--adm-bg)] text-[var(--adm-ink)]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1440px]">
        <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r border-[var(--adm-line)] bg-[#101316] lg:flex">
          <div className="px-5 pb-4 pt-6">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--adm-accent)]">Rusher</p>
            <p className="mt-1 text-[18px] font-extrabold">Consola</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Secciones de la consola">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-12 items-center gap-3 rounded-[14px] px-3 outline-none ring-[var(--adm-accent)] focus-visible:ring-2 ${isActive ? "bg-[var(--adm-accent)] text-[#0B0D0F]" : "text-[var(--adm-ink)] hover:bg-white/5"}`
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-extrabold">{item.label}</span>
                  <span className="block text-[11px] font-semibold opacity-70">{item.hint}</span>
                </span>
                {item.to === "/admin/usuarios" && newUsers > 0 ? (
                  <span className="rounded-full bg-[var(--adm-cyan)] px-2 py-0.5 text-[11px] font-extrabold text-[#041018]">{newUsers}</span>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => navigate("/")} className="m-3 flex min-h-12 items-center gap-2 rounded-[14px] px-3 text-[13px] font-extrabold text-[var(--adm-muted)] outline-none ring-[var(--adm-accent)] focus-visible:ring-2">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Volver a Rusher
          </button>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-[var(--adm-line)] bg-[var(--adm-bg)]/95 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--adm-accent)]">Consola de Rusher</p>
                <h1 className="text-[20px] font-extrabold">{title}</h1>
              </div>
              <button type="button" onClick={() => navigate("/")} className="min-h-11 rounded-full px-3 text-[12px] font-extrabold text-[var(--adm-muted)] lg:hidden">Salir</button>
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Secciones de la consola">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `min-h-11 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-extrabold outline-none ring-[var(--adm-accent)] focus-visible:ring-2 ${isActive ? "bg-[var(--adm-accent)] text-[#0B0D0F]" : "bg-[#171B1F] text-[var(--adm-ink)]"}`
                  }
                >
                  {item.label}
                  {item.to === "/admin/usuarios" && newUsers > 0 ? ` · ${newUsers}` : ""}
                </NavLink>
              ))}
            </nav>
          </header>
          <main className="px-4 py-5 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export function Panel({ title, note, children, action }: { title: string; note?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-4 rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-extrabold">{title}</h2>
          {note ? <p className="mt-1 max-w-[62ch] text-[13px] font-semibold leading-snug text-[var(--adm-muted)]">{note}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const TONES = {
  accent: "border-t-[var(--adm-accent)]",
  cyan: "border-t-[var(--adm-cyan)]",
  pink: "border-t-[var(--adm-pink)]",
  amber: "border-t-[var(--adm-amber)]",
  violet: "border-t-[var(--adm-violet)]",
};

export function Metric({ label, value, note, tone = "accent" }: { label: string; value: string; note: string; tone?: keyof typeof TONES }) {
  return (
    <article className={`rounded-[14px] border border-[var(--adm-line)] border-t-[3px] bg-[var(--adm-card)] p-4 ${TONES[tone]}`}>
      <p className="text-[12px] font-bold text-[var(--adm-muted)]">{label}</p>
      <p className="mt-2 text-[28px] font-extrabold tabular-nums tracking-tight text-[var(--adm-ink)]">{value}</p>
      <p className="mt-2 text-[12px] font-semibold leading-snug text-[var(--adm-muted)]">{note}</p>
    </article>
  );
}

export function Chip({ children, tone }: { children: string; tone: "accent" | "cyan" | "pink" | "amber" | "violet" | "wa" }) {
  const colors = {
    accent: "bg-[var(--adm-accent)] text-[#0B0D0F]",
    cyan: "bg-[var(--adm-cyan)] text-[#041018]",
    pink: "bg-[var(--adm-pink)] text-white",
    amber: "bg-[var(--adm-amber)] text-[#1A1203]",
    violet: "bg-[var(--adm-violet)] text-white",
    wa: "bg-[var(--adm-wa)] text-[#04140C]",
  };
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2 text-[11px] font-extrabold uppercase ${colors[tone]}`}>{children}</span>;
}

export function Banner({ failure }: { failure: AdminFailure | null }) {
  if (!failure) return null;
  const tone = failure.kind === "permission" || failure.kind === "infrastructure" ? "border-[var(--adm-pink)] text-[var(--adm-pink)]" : "border-[var(--adm-amber)] text-[var(--adm-amber)]";
  return (
    <p role="alert" className={`mb-4 rounded-[14px] border px-4 py-3 text-[13px] font-bold ${tone}`}>
      {failure.message}
    </p>
  );
}

export function Notice({ children }: { children: string }) {
  return <p className="mb-4 rounded-[14px] bg-[var(--adm-accent)] px-4 py-3 text-[13px] font-extrabold text-[#0B0D0F]">{children}</p>;
}

export function Empty({ children }: { children: string }) {
  return <p className="rounded-[14px] bg-[#0B0D0F] px-4 py-8 text-center text-[14px] font-semibold text-[var(--adm-muted)]">{children}</p>;
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label={label}>
      {["a", "b", "c", "d"].map((key) => (
        <div key={key} className="h-28 animate-pulse rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)]" />
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[12px] font-extrabold text-[var(--adm-muted)]">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass = "h-12 w-full rounded-[14px] border border-[var(--adm-line)] bg-[#0B0D0F] px-3 text-[16px] font-bold text-[var(--adm-ink)] outline-none ring-[var(--adm-accent)] focus:border-[var(--adm-accent)] focus-visible:ring-2";

export function Primary({ children, disabled, onClick, type = "button" }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="min-h-12 rounded-[14px] bg-[var(--adm-accent)] px-4 text-[14px] font-extrabold text-[#0B0D0F] outline-none ring-[var(--adm-ink)] focus-visible:ring-2 disabled:opacity-50">
      {children}
    </button>
  );
}

export function Ghost({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-12 rounded-[14px] border border-[var(--adm-line)] px-4 text-[14px] font-extrabold text-[var(--adm-ink)] outline-none ring-[var(--adm-accent)] focus-visible:ring-2">
      {children}
    </button>
  );
}

export function when(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
