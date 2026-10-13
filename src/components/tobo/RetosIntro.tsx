import { useEffect, useState } from "react";
import { Swords, Timer, Trophy, X } from "lucide-react";
import { retoAckIntro, retoPrefs } from "@/services/retosApi";
import { openRetoSheet, type RetoSheetRequest } from "@/state/retoSheet";
import { usePulse } from "@/state/PulseContext";

const SLIDES = [
  {
    icon: Swords,
    title: "Reta a tus panas",
    body: "Apuesta puntos con un amigo, en un juego o en una trivia.",
  },
  {
    icon: Timer,
    title: "Juegan lo mismo",
    body: "Los dos hacen el mismo pronóstico o la misma trivia.",
  },
  {
    icon: Trophy,
    title: "El que gane se lleva los puntos",
    body: "Quien saque más se lleva los puntos del otro.",
  },
];

export function RetosIntro() {
  const { currentUser } = usePulse();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [queued, setQueued] = useState<Partial<Omit<RetoSheetRequest, "id">> | null>(null);
  const Icon = SLIDES[step].icon;

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    let alive = true;

    async function maybeShowIntro(request: Partial<Omit<RetoSheetRequest, "id">>, forceOpen: boolean) {
      if (!alive) return;
      setQueued(request);
      try {
        const prefs = await retoPrefs();
        if (!alive) return;
        if (prefs.introSeen && !forceOpen) {
          openRetoSheet(request);
          return;
        }
        setStep(0);
        setOpen(true);
        window.dispatchEvent(new Event("rusher-overlay-open"));
      } catch (reason: unknown) {
        console.error("reto", reason);
        openRetoSheet(request);
      }
    }

    function onOpen(event: Event) {
      const detail = (event as CustomEvent).detail as Partial<Omit<RetoSheetRequest, "id">> | undefined;
      void maybeShowIntro(detail ?? {}, false);
    }

    function onHowto() {
      setQueued(null);
      setStep(0);
      setOpen(true);
      window.dispatchEvent(new Event("rusher-overlay-open"));
    }

    window.addEventListener("rusher-reto-open", onOpen as EventListener);
    window.addEventListener("rusher-reto-howto", onHowto);
    return () => {
      alive = false;
      window.removeEventListener("rusher-reto-open", onOpen as EventListener);
      window.removeEventListener("rusher-reto-howto", onHowto);
    };
  }, [currentUser?.id]);

  async function close(openSheet: boolean) {
    setOpen(false);
    try {
      await retoAckIntro();
    } catch (reason: unknown) {
      console.error("reto", reason);
    }
    window.dispatchEvent(new Event("rusher-overlay-closed"));
    if (openSheet && queued) openRetoSheet(queued);
  }

  if (!open) return null;
  const last = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" style={{ backgroundColor: "rgba(0,0,0,0.62)" }}>
      <section className="w-full rounded-t-[28px] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:max-w-[520px] sm:rounded-[28px] sm:pb-5" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
        <div className="flex justify-end">
          <button type="button" aria-label="Omitir" onClick={() => void close(true)} className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <span className="mt-2 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
          <Icon className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-[26px] font-extrabold leading-tight">{SLIDES[step].title}</h2>
        <p className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: "var(--t-muted)" }}>{SLIDES[step].body}</p>
        <div className="mt-5 flex gap-2">
          {SLIDES.map((slide, index) => (
            <span key={slide.title} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: index <= step ? "var(--t-accent)" : "var(--t-border)" }} />
          ))}
        </div>
        {last ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void close(true)} className="min-h-12 rounded-2xl text-[14px] font-extrabold" style={{ border: "1px solid var(--t-border)" }}>Omitir</button>
            <button type="button" onClick={() => void close(true)} className="min-h-12 rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>Empezar</button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void close(true)} className="min-h-12 rounded-2xl text-[14px] font-extrabold" style={{ border: "1px solid var(--t-border)" }}>Omitir</button>
            <button type="button" onClick={() => setStep((value) => value + 1)} className="min-h-12 rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>Siguiente</button>
          </div>
        )}
      </section>
    </div>
  );
}
