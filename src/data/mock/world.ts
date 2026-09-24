import type { Collection, ExperienceMission, LivePulseEvent, QRInteraction } from "@/types/pulse";

function tonightAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export const EXPERIENCE_MISSIONS: ExperienceMission[] = [
  {
    id: "route_tobo",
    experienceId: "exp_tobo",
    title: "La Ruta del Tobo",
    description: "Encuentra 3 códigos Pulse en Caracas y abre la trivia secreta.",
    layers: ["exploration", "discovery", "chain"],
    points: 1000,
    badgeName: "Explorador",
    rewardId: "reward_tobo",
    hideRewardUntilComplete: false,
    steps: [
      { id: "step_qr_1", label: "Encuentra el código 1", layer: "exploration", qrId: "qr_tobo_1" },
      { id: "step_qr_2", label: "Encuentra el código 2", layer: "exploration", qrId: "qr_tobo_2" },
      { id: "step_qr_3", label: "Encuentra el código 3", layer: "exploration", qrId: "qr_tobo_3" },
      { id: "step_secret_trivia", label: "Completa la trivia secreta", layer: "chain", gameId: "game_trivia_flash" },
    ],
  },
];

export const QR_INTERACTIONS: QRInteraction[] = [
  {
    id: "qr_tobo_1",
    experienceId: "exp_tobo",
    code: "PULSE-TOBO-1",
    title: "Código 1 · Sabana Grande",
    venueId: "venue_tasca_c",
    hint: "Está en la barra de Tasca 27.",
    distanceLabel: "400 m",
    effect: { kind: "progress", points: 300, stepId: "step_qr_1", clue: "El siguiente código está hacia el este." },
  },
  {
    id: "qr_tobo_2",
    experienceId: "exp_tobo",
    code: "PULSE-TOBO-2",
    title: "Código 2 · El Recreo",
    venueId: "venue_tasca_b",
    hint: "Pregunta por el posavasos naranja.",
    distanceLabel: "1.2 km",
    effect: { kind: "challenge", points: 300, gameId: "game_quick_pick", stepId: "step_qr_2" },
  },
  {
    id: "qr_tobo_3",
    experienceId: "exp_tobo",
    code: "PULSE-TOBO-3",
    title: "Código secreto",
    venueId: "venue_tasca_a",
    hint: "Uno de los tres locales tiene el código escondido.",
    distanceLabel: "cerca",
    secret: true,
    activeUntil: tonightAt(23),
    effect: { kind: "reward", points: 300, rewardId: "reward_tobo", stepId: "step_qr_3", clue: "El tobo se acerca." },
  },
  {
    id: "qr_leones",
    experienceId: "exp_tobo",
    code: "PULSE-LEONES",
    title: "Pieza · Leones",
    venueId: "venue_tasca_a",
    hint: "Una pieza de la colección está en Tasca Central.",
    effect: { kind: "unlock", points: 80, stepId: "item_leones" },
  },
  {
    id: "qr_tiburones",
    experienceId: "exp_tobo",
    code: "PULSE-TIBURONES",
    title: "Pieza · Tiburones",
    venueId: "venue_tasca_b",
    hint: "Otra pieza espera en Tasca del Este.",
    effect: { kind: "unlock", points: 80, stepId: "item_tiburones" },
  },
  {
    id: "qr_magallanes",
    experienceId: "exp_tobo",
    code: "PULSE-MAGALLANES",
    title: "Pieza · Magallanes",
    venueId: "venue_tasca_c",
    hint: "La tercera pieza está en Sabana Grande.",
    effect: { kind: "unlock", points: 80, stepId: "item_magallanes" },
  },
  {
    id: "qr_cardenales",
    experienceId: "exp_tobo",
    code: "PULSE-CARDENALES",
    title: "Pieza · Cardenales",
    venueId: "venue_tasca_a",
    hint: "La última pieza aparece cuando tienes las otras tres.",
    secret: true,
    effect: { kind: "unlock", points: 120, stepId: "item_cardenales" },
  },
];

export const COLLECTIONS: Collection[] = [
  {
    id: "col_equipos",
    experienceId: "exp_tobo",
    title: "Colecciona los 4",
    unlockLabel: "Desbloqueas el reto de la final.",
    items: [
      { id: "item_leones", label: "Leones", qrId: "qr_leones" },
      { id: "item_tiburones", label: "Tiburones", qrId: "qr_tiburones" },
      { id: "item_magallanes", label: "Magallanes", qrId: "qr_magallanes" },
      { id: "item_cardenales", label: "Cardenales", qrId: "qr_cardenales" },
    ],
  },
];

export const LIVE_EVENTS: LivePulseEvent[] = [
  { id: "live_1", text: "@Carlos encontró un código", at: "hace 2 min" },
  { id: "live_2", text: "@María subió al Top 10", at: "hace 8 min" },
  { id: "live_3", text: "3 personas hicieron check-in en Tasca 27", at: "hace 14 min" },
  { id: "live_4", text: "@Pedro completó La Ruta del Tobo", at: "hace 21 min" },
];

export const SECRET_EXPERIENCE = {
  id: "exp_after_dark",
  name: "Tobo After Dark",
  description: "Una noche corta. Se abre cuando completas la ruta.",
  unlockMissionId: "route_tobo",
};
