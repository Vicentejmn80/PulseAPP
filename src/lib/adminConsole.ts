export type AdminFailureKind = "permission" | "infrastructure" | "migration" | "validation" | "network";

export interface AdminFailure {
  kind: AdminFailureKind;
  message: string;
}

export function classifyAdminFailure(input: {
  status?: number;
  code?: string;
  message?: string;
  network?: boolean;
}): AdminFailure {
  if (input.network) {
    return { kind: "network", message: "No hay conexión con el servidor." };
  }
  if (input.status === 503 || input.code === "ADMIN_UNAVAILABLE") {
    return {
      kind: "infrastructure",
      message: "El panel no puede conectar con la base de datos. No es un error de tu contraseña. En el servidor deben existir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
    };
  }
  if (input.status === 403 || input.code === "FORBIDDEN") {
    return { kind: "permission", message: "Tu cuenta no tiene permiso de administración." };
  }
  if (input.status === 501 || input.code === "ADMIN_MIGRATION_REQUIRED") {
    return {
      kind: "migration",
      message: "Esta sección está en la aplicación, pero la migración del panel todavía no está aplicada en la base de datos.",
    };
  }
  const message = input.message?.trim();
  return { kind: "validation", message: message || "No se pudo completar la operación." };
}

/** Misma condición que pulse_admin_set_result: un marcador idéntico no vuelve a puntuar lo ya procesado. */
export function shouldRescorePrediction(sameResult: boolean, alreadyProcessed: boolean) {
  return !alreadyProcessed || !sameResult;
}

export function settlementNotice(scored: number, points: number, correcting = false) {
  if (scored > 0 && correcting) {
    return `Marcador corregido. Puntos ajustados en ${scored} pronósticos · ${points} pts · Tabla actualizada`;
  }
  if (scored > 0) {
    return `Puntos liberados a ${scored} usuarios · Tabla actualizada`;
  }
  return "Ese marcador ya estaba publicado. No se duplicaron puntos.";
}

export function campaignRewardSource(campaignId: string, userId: string) {
  const campaign = campaignId.trim();
  const user = userId.trim();
  if (!campaign || !user) return null;
  return `${campaign}:${user}`;
}

export function adjustmentSourceId(requestId: string) {
  const id = requestId.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return null;
  return id;
}

export function pageWindow(total: number, page: number, pageSize: number) {
  const size = Math.min(50, Math.max(1, Math.floor(pageSize)));
  const safeTotal = Math.max(0, Math.floor(total));
  const pages = Math.max(1, Math.ceil(safeTotal / size) || 1);
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  return { page: current, pageSize: size, pages, offset: (current - 1) * size, total: safeTotal };
}

export function exactHandle(value: string) {
  const handle = value.trim();
  if (!/^@[A-Za-z0-9._]{2,32}$/.test(handle)) return null;
  return handle;
}
