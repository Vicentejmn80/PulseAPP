import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, House, MapPin, Trophy, UserRound, X } from "lucide-react";
import {
  LVBP_ONBOARDING_EVENT,
  LVBP_ONBOARDING_STEPS,
  ONBOARDING_AFTER_INTRO_MS,
  TOBO_INTRO_SESSION_KEY,
  clearOnboarding,
  onboardingDelayMs,
  onboardingIndexForPath,
  readOnboardingDone,
  writeOnboardingDone,
} from "@/lib/lvbpOnboarding";
import { TOBO_TABS } from "@/lib/toboTabs";
import { usePulse } from "@/state/PulseContext";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<(typeof LVBP_ONBOARDING_STEPS)[number]["id"], LucideIcon> = {
  inicio: House,
  quiniela: CalendarDays,
  ranking: Trophy,
  tascas: MapPin,
  perfil: UserRound,
};

export function replayLvbpOnboarding(userId: string) {
  clearOnboarding(userId);
  window.dispatchEvent(new Event(LVBP_ONBOARDING_EVENT));
}

/** Tarjeta breve sobre las pestañas reales. No tapa la barra ni el registro. */
export function ToboOnboarding() {
  const { currentUser } = usePulse();
  const userId = currentUser?.id ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [fallbackStep, setFallbackStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [delayMs] = useState(() => {
    if (typeof window === "undefined") return ONBOARDING_AFTER_INTRO_MS;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const introShown = sessionStorage.getItem(TOBO_INTRO_SESSION_KEY) === "1";
    return onboardingDelayMs(introShown, reduced);
  });

  const mapped = onboardingIndexForPath(location.pathname);
  const step = mapped ?? fallbackStep;
  const current = LVBP_ONBOARDING_STEPS[step] ?? LVBP_ONBOARDING_STEPS[0];
  const total = LVBP_ONBOARDING_STEPS.length;
  const Icon = ICONS[current.id];

  useEffect(() => {
    if (!userId || readOnboardingDone(userId)) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (!cancelled && !readOnboardingDone(userId)) setOpen(true);
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [delayMs, userId]);

  useEffect(() => {
    function onChange() {
      if (!userId || readOnboardingDone(userId)) {
        setOpen(false);
        return;
      }
      setFallbackStep(0);
      setOpen(true);
    }
    window.addEventListener(LVBP_ONBOARDING_EVENT, onChange);
    return () => window.removeEventListener(LVBP_ONBOARDING_EVENT, onChange);
  }, [userId]);

  function finish() {
    writeOnboardingDone(userId);
    setOpen(false);
  }

  function go(index: number) {
    const next = Math.max(0, Math.min(total - 1, index));
    const tab = TOBO_TABS[next];
    setFallbackStep(next);
    if (tab) navigate(tab.to);
  }

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (step >= total - 1) finish();
        else go(step + 1);
      } else if (event.key === "ArrowLeft" && step > 0) {
        event.preventDefault();
        go(step - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // finish y go se recrean en cada render; el efecto debe ver el paso actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, total, userId]);

  if (!open || !userId) return null;

  const last = step >= total - 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-end px-4 pb-[calc(74px+env(safe-area-inset-bottom)+12px)]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="lvbp-onboarding-title"
        aria-describedby="lvbp-onboarding-body"
        tabIndex={-1}
        className="flyer-in pointer-events-auto w-full rounded-[22px] px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.45)] outline-none"
        style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33", color: "var(--t-text)" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "rgba(207,255,0,0.14)", color: "var(--t-accent)" }}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>
              {step + 1} de {total}
            </p>
            <h2 id="lvbp-onboarding-title" className="mt-1 text-[18px] font-extrabold leading-tight">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="Cerrar introducción"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--t-muted)" }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p id="lvbp-onboarding-body" className="mt-3 text-[14px] font-semibold leading-snug" style={{ color: "var(--t-muted)" }}>
          {current.body}
        </p>
        <p className="mt-2 text-[13px] font-extrabold" style={{ color: "var(--t-text)" }}>
          {current.action}
        </p>
        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {LVBP_ONBOARDING_STEPS.map((item, index) => (
            <span
              key={item.id}
              className="h-1.5 rounded-full"
              style={{
                width: index === step ? 18 : 8,
                backgroundColor: index === step ? "var(--t-accent)" : "#2A2F33",
              }}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            className="min-h-11 rounded-full px-3 text-[13px] font-extrabold disabled:invisible"
            style={{ color: "var(--t-muted)" }}
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={finish}
            className="min-h-11 flex-1 rounded-full text-[13px] font-extrabold"
            style={{ color: "var(--t-muted)" }}
          >
            Saltar
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : go(step + 1))}
            className="min-h-11 rounded-full px-4 text-[13px] font-extrabold text-[#0B0D0F]"
            style={{ backgroundColor: "var(--t-accent)" }}
          >
            {last ? "Entendido" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
