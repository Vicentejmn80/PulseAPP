import { TOBO_TABS, type ToboTabId } from "@/lib/toboTabs";

/**
 * Introducción de las pestañas de Béisbol Rush LVBP.
 * No es una decisión de seguridad: no abre permisos ni datos.
 * Se guarda en localStorage, ligada al id de la cuenta, igual que el resto
 * del estado de interfaz. Un usuario nuevo en el mismo teléfono sí la ve;
 * quien ya la cerró no la vuelve a ver en este dispositivo.
 * No se replica al servidor: el perfil no tiene preferencias de UI y un
 * campo nuevo tocaría el snapshot de sesión sin aportar control de acceso.
 * Saltar, cerrar o finalizar guardan el mismo estado. Para verla otra vez
 * existe "Ver introducción de nuevo" en Perfil.
 */
export const LVBP_ONBOARDING_STORAGE_PREFIX = "rusher-lvbp-onboarding:";
export const LVBP_ONBOARDING_EVENT = "rusher-lvbp-onboarding";
export const TOBO_INTRO_SESSION_KEY = "tobo-intro-shown";
export const ONBOARDING_AFTER_INTRO_MS = 1700;

export const LVBP_ONBOARDING_STEPS: ReadonlyArray<{
  id: ToboTabId;
  title: string;
  body: string;
  action: string;
}> = [
  {
    id: "inicio",
    title: "Inicio",
    body: "Todo lo importante de Béisbol Rush LVBP en un solo lugar. Revisa la ronda actual, los próximos partidos, las trivias del día y las novedades.",
    action: "Mira la ronda y los partidos de hoy.",
  },
  {
    id: "quiniela",
    title: "Pronósticos",
    body: "Predice los resultados de los partidos antes de que comiencen y suma puntos según el sistema de puntuación oficial.",
    action: "Abre un partido y registra tu pronóstico.",
  },
  {
    id: "ranking",
    title: "Ranking",
    body: "Comprueba tu posición frente a otros jugadores y descubre quién lidera la competencia de la ronda.",
    action: "Revisa el ranking de la ronda.",
  },
  {
    id: "tascas",
    title: "Tascas",
    body: "Descubre las tascas participantes, abre su ficha y escanea el QR cuando las visites.",
    action: "Entra a una tasca para ver su ficha.",
  },
  {
    id: "perfil",
    title: "Perfil",
    body: "Consulta tus puntos, tu actividad reciente y tus ligas. Desde aquí puedes volver a ver esta introducción.",
    action: "Revisa tu resumen cuando quieras.",
  },
];

export function onboardingStorageKey(userId: string) {
  return `${LVBP_ONBOARDING_STORAGE_PREFIX}${userId}`;
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserOnboardingStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readOnboardingDone(userId: string, store: KeyValueStore | null = browserOnboardingStore()) {
  if (!userId || !store) return false;
  try {
    return store.getItem(onboardingStorageKey(userId)) === "done";
  } catch {
    return false;
  }
}

export function writeOnboardingDone(userId: string, store: KeyValueStore | null = browserOnboardingStore()) {
  if (!userId || !store) return;
  try {
    store.setItem(onboardingStorageKey(userId), "done");
  } catch {
    /* el navegador puede bloquear el almacenamiento; la intro no es un candado */
  }
}

export function clearOnboarding(userId: string, store: KeyValueStore | null = browserOnboardingStore()) {
  if (!userId || !store) return;
  try {
    store.removeItem(onboardingStorageKey(userId));
  } catch {
    /* igual que al guardar */
  }
}

export function onboardingDelayMs(introAlreadyShown: boolean, reducedMotion: boolean) {
  if (reducedMotion || introAlreadyShown) return 0;
  return ONBOARDING_AFTER_INTRO_MS;
}

/** Índice de la pestaña que corresponde a la ruta actual. Null si es otra pantalla de Tobo. */
export function onboardingIndexForPath(pathname: string) {
  if (pathname === "/tobo" || pathname.startsWith("/tobo/trivias")) return 0;
  if (pathname.startsWith("/tobo/mi-quiniela") || pathname.startsWith("/tobo/partidos")) return 1;
  if (pathname.startsWith("/tobo/ranking")) return 2;
  if (pathname.startsWith("/tobo/tascas") || pathname.startsWith("/tobo/venue")) return 3;
  if (pathname.startsWith("/tobo/profile")) return 4;
  return null;
}

export function onboardingStepsMatchTabs() {
  return LVBP_ONBOARDING_STEPS.every((step, index) => {
    const tab = TOBO_TABS[index];
    return tab?.id === step.id && tab.label === step.title;
  }) && LVBP_ONBOARDING_STEPS.length === TOBO_TABS.length;
}
