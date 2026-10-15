const LABELS: Record<string, string> = {
  register: "Usuario registrado",
  login: "Inicio de sesión",
  campaign_reward: "Recompensa reclamada",
  pulse_admin_set_result: "Resultado deportivo confirmado",
  pulse_admin_adjust_points: "Corrección de puntos",
  pulse_admin_set_suspension: "Estado de la cuenta",
  pulse_admin_grant: "Acceso administrativo",
  pulse_admin_save_ally: "Local aliado actualizado",
  pulse_admin_save_campaign: "Campaña actualizada",
  bootstrap_step0: "Configuración inicial del administrador",
  prediction: "Puntos de pronóstico",
  qr_scan: "Recompensa de visita",
  admin_adjust: "Corrección de puntos",
  trivia: "Puntos de trivia",
};

/** Etiqueta visible. El código original se conserva en los datos, no se reescribe. */
export function adminActionLabel(code: string) {
  const key = code.trim();
  return LABELS[key] ?? "Actividad registrada";
}

export function adminCodeIsKnown(code: string) {
  return Object.prototype.hasOwnProperty.call(LABELS, code.trim());
}
