import { useEffect, useState } from "react";

const SESSION_KEY = "tobo-intro-shown";

/** Full-screen brand overlay that plays once per navigation into Tobo.
 *  Respects prefers-reduced-motion: no animation = instant dismiss. */
export function CategoryTransition() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    if (reduced) return false;
    return !sessionStorage.getItem(SESSION_KEY);
  });

  useEffect(() => {
    if (!visible) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    // Hide after animation completes (1.5 s)
    const id = window.setTimeout(() => setVisible(false), 1550);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="tobo-intro pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "#0B0D0F" }}
    >
      <p
        className="text-[10px] font-extrabold uppercase tracking-[0.32em]"
        style={{ color: "var(--t-accent)" }}
      >
        Una experiencia de Rusher
      </p>
      <h1
        className="mt-3 text-center text-[30px] font-extrabold leading-tight tracking-tight"
        style={{ color: "var(--t-text)" }}
      >
        Juégate
        <br />
        el Tobo
      </h1>
      <div
        className="mt-5 h-1 w-12 rounded-full"
        style={{ backgroundColor: "var(--t-accent)" }}
      />
    </div>
  );
}
