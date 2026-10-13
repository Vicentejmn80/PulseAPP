import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { trackEvent } from "@/services/analytics";
import {
  browserInstallStore,
  inAppBrowser,
  isAppleMobile,
  isInstalledDisplay,
  readInstallHidden,
  writeInstallCompleted,
  writeInstallDismissed,
} from "@/lib/pwaInstall";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallBanner() {
  const [mode, setMode] = useState<"hidden" | "native" | "ios" | "inapp" | "guide">("hidden");
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [blocked, setBlocked] = useState(true);

  useEffect(() => {
    function release() {
      setBlocked(false);
    }
    window.addEventListener("rusher-reto-intro-closed", release);
    return () => window.removeEventListener("rusher-reto-intro-closed", release);
  }, []);

  useEffect(() => {
    if (blocked) return undefined;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const appleStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (isInstalledDisplay(standalone, appleStandalone) || readInstallHidden(Date.now(), browserInstallStore())) {
      setMode("hidden");
      return undefined;
    }
    const ua = navigator.userAgent;
    if (inAppBrowser(ua)) {
      setMode("inapp");
      trackEvent("pwa_banner_seen", { mode: "inapp" });
      return undefined;
    }
    if (isAppleMobile(ua)) {
      setMode("ios");
      trackEvent("pwa_banner_seen", { mode: "ios" });
      return undefined;
    }
    function onPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as PromptEvent);
      setMode("native");
      trackEvent("pwa_banner_seen", { mode: "native" });
    }
    function onInstalled() {
      writeInstallCompleted();
      setMode("hidden");
      trackEvent("pwa_installed");
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [blocked]);

  function dismiss() {
    writeInstallDismissed(Date.now());
    setMode("hidden");
  }

  async function install() {
    trackEvent("pwa_install_tapped", { mode });
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      writeInstallCompleted();
      trackEvent("pwa_installed");
      setMode("hidden");
    }
  }

  if (mode === "hidden") return null;

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-3 rounded-2xl px-3 py-2" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
        <img src={`${import.meta.env.BASE_URL}icons/rush-ios-180.png`} alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <p className="min-w-0 flex-1 text-[13px] font-extrabold leading-snug">Instala la app y entra con un toque</p>
        {mode === "native" && (
          <button type="button" onClick={() => void install()} className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>Instalar</button>
        )}
        {mode === "ios" && (
          <button type="button" onClick={() => { trackEvent("pwa_install_tapped", { mode: "ios" }); setMode("guide"); }} className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>Cómo instalar</button>
        )}
        {mode === "inapp" && (
          <p className="max-w-[42%] text-right text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>Ábrelo en Safari o Chrome para instalar la app</p>
        )}
        <button type="button" aria-label="Cerrar aviso" onClick={dismiss} className="shrink-0 p-1"><X className="h-4 w-4" /></button>
      </div>
      {mode === "guide" && (
        <div className="mt-2 rounded-2xl p-3" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <p className="text-[14px] font-extrabold">En iPhone o iPad</p>
          <ol className="mt-3 flex flex-col gap-3 text-[13px] font-bold">
            <li className="flex items-center gap-2"><Share className="h-4 w-4" style={{ color: "var(--t-accent)" }} /> 1. Toca Compartir</li>
            <li className="flex items-center gap-2"><SquarePlus className="h-4 w-4" style={{ color: "var(--t-accent)" }} /> 2. Agregar a pantalla de inicio</li>
            <li className="flex items-center gap-2"><span className="flex h-4 w-4 items-center justify-center text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>3</span> 3. Agregar</li>
          </ol>
        </div>
      )}
    </div>
  );
}
