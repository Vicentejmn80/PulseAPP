export function formato(n: number) {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function gameTypeLabel(type: string) {
  if (type === "trivia") return "Trivia";
  if (type === "prediction") return "Predicción";
  if (type === "quick_challenge") return "Reto rápido";
  if (type === "checkin") return "Check-in";
  if (type === "mission") return "Misión";
  return "Actividad";
}

export function requirementLabel(type: string) {
  if (type === "trivia") return "Preguntas";
  if (type === "checkin") return "Check-in en tasca";
  return gameTypeLabel(type);
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
