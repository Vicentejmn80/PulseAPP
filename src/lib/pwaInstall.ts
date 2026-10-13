const DISMISS_KEY = "rusher-pwa-dismiss-until";
const INSTALLED_KEY = "rusher-pwa-installed";
export const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem"> | null;

export function browserInstallStore(): Store {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function isInstalledDisplay(standalone: boolean, navigatorStandalone: boolean) {
  return standalone || navigatorStandalone;
}

export function inAppBrowser(userAgent: string) {
  return /WhatsApp|Instagram|TikTok|FBAN|FBAV|FB_IAB|FB4A|FBIOS/i.test(userAgent);
}

export function isAppleMobile(userAgent: string) {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function readInstallHidden(now: number, store: Store = browserInstallStore()) {
  if (!store) return false;
  try {
    if (store.getItem(INSTALLED_KEY) === "1") return true;
    const until = Number(store.getItem(DISMISS_KEY) || 0);
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

export function writeInstallDismissed(now: number, store: Store = browserInstallStore()) {
  if (!store) return;
  try {
    store.setItem(DISMISS_KEY, String(now + PWA_DISMISS_MS));
  } catch {
    /* modo privado */
  }
}

export function writeInstallCompleted(store: Store = browserInstallStore()) {
  if (!store) return;
  try {
    store.setItem(INSTALLED_KEY, "1");
  } catch {
    /* modo privado */
  }
}
