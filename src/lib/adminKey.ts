const KEY = "pulse-admin-key";

/** Clave guardada en esta pestaña, o la clave del perfil si todavía no hay una. */
export function storedAdminKey(profileCode = "") {
  const saved = sessionStorage.getItem(KEY)?.trim() ?? "";
  return saved || profileCode.trim();
}

export function rememberAdminKey(value: string) {
  const trimmed = value.trim();
  if (trimmed) sessionStorage.setItem(KEY, trimmed);
  else sessionStorage.removeItem(KEY);
  return trimmed;
}
