import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function ToboCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[20px] p-4 shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${className}`}
      style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
    >
      {children}
    </section>
  );
}

export function IconChip({
  icon: Icon,
  color,
  size = "md",
}: {
  icon: LucideIcon;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const glyph = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${box}`}
      style={{ backgroundColor: `${color}24`, color }}
    >
      <Icon className={glyph} strokeWidth={2.3} />
    </span>
  );
}

export function CardHead({
  icon,
  title,
  chip = "var(--t-accent)",
  action,
}: {
  icon: LucideIcon;
  title: string;
  chip?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <IconChip icon={icon} color={chip} size="sm" />
        <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-muted)" }}>
          {title}
        </p>
      </div>
      {action && (
        <button type="button" onClick={action.onClick} className="shrink-0 text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function GoldCta({
  children,
  onClick,
  icon: Icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-[14px] font-extrabold tracking-wide shadow-[0_8px_18px_rgba(255,201,74,0.22)]"
      style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
    >
      {Icon ? <Icon className="h-4 w-4" strokeWidth={2.6} /> : null}
      {children}
    </button>
  );
}

export function GhostCta({ children, onClick, icon: Icon }: { children: ReactNode; onClick?: () => void; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] px-3 py-3 text-[13px] font-extrabold"
      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "white", border: "1px solid var(--t-border)" }}
    >
      {Icon ? <Icon className="h-4 w-4" strokeWidth={2.4} /> : null}
      {children}
    </button>
  );
}

export function StatCell({ value, label, hint }: { value: ReactNode; label: string; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
      <p className="text-[22px] font-extrabold tabular-nums leading-none">{value}</p>
      {hint}
      <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{label}</p>
    </div>
  );
}

export function StatLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3" style={{ borderTop: "1px solid var(--t-border)" }}>
      <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>{label}</p>
      <p className="text-[16px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
