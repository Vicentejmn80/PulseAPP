/** Pestañas reales de Juégate el Tobo. La barra y la introducción usan esta lista. */
export const TOBO_TABS = [
  { id: "inicio", to: "/tobo", label: "Inicio" },
  { id: "quiniela", to: "/tobo/mi-quiniela", label: "Pronósticos" },
  { id: "ranking", to: "/tobo/ranking", label: "Ranking" },
  { id: "tascas", to: "/tobo/tascas", label: "Tascas" },
  { id: "perfil", to: "/tobo/profile", label: "Perfil" },
] as const;

export type ToboTabId = (typeof TOBO_TABS)[number]["id"];

export function isToboTabActive(pathname: string, to: string) {
  return to === "/tobo" ? pathname === "/tobo" : pathname.startsWith(to);
}
