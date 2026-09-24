import type {
  Badge,
  Experience,
  Game,
  Mission,
  PointsTransaction,
  Reward,
  UserProfile,
  Venue,
} from "@/types/pulse";

export const USERS: UserProfile[] = [
  { id: "user_sofia", alias: "Sofía", handle: "@sofia", initials: "SO", avatarColor: "#FF8A3D" },
  { id: "user_diego", alias: "Diego", handle: "@diego", initials: "DI", avatarColor: "#5C4DDB" },
  { id: "user_mateo", alias: "Mateo", handle: "@mateo", initials: "MA", avatarColor: "#1F9D62" },
  { id: "user_ana", alias: "Ana", handle: "@ana", initials: "AN", avatarColor: "#E0A106" },
];

export const VENUES: Venue[] = [
  { id: "venue_tasca_a", name: "Tasca Central", category: "Tasca", address: "Av. Principal 120", city: "Caracas", status: "active" },
  { id: "venue_tasca_b", name: "Tasca del Este", category: "Tasca", address: "Calle 8, C.C. El Recreo", city: "Caracas", status: "active" },
  { id: "venue_tasca_c", name: "Tasca 27", category: "Tasca", address: "Bulevar de Sabana Grande", city: "Caracas", status: "active" },
];

export const EXPERIENCES: Experience[] = [
  {
    id: "exp_tobo",
    name: "Juégate el Tobo",
    description: "Predice, juega y visita tascas durante la temporada.",
    category: "Temporada LVBP",
    status: "active",
    startDate: "2026-10-01",
    endDate: "2027-02-01",
    venueIds: ["venue_tasca_a", "venue_tasca_b", "venue_tasca_c"],
    gameIds: ["game_prediction_today", "game_trivia_flash", "game_quick_pick"],
    missionIds: ["mission_day", "mission_hunter"],
    rewardIds: ["reward_tobo"],
    visual: {
      gradient: "from-[#FF8A3C] via-[#FF4F1A] to-[#E8360C]",
      accent: "#FF4F1A",
      icon: "fire",
    },
  },
  {
    id: "exp_burger",
    name: "Burger Challenge",
    description: "Próxima experiencia de Pulse.",
    category: "Gastronomía",
    status: "upcoming",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    venueIds: [],
    gameIds: [],
    missionIds: [],
    rewardIds: [],
    visual: {
      gradient: "from-[#FF8D7A] to-[#E23B2F]",
      accent: "#E23B2F",
      icon: "trophy",
    },
  },
];

export const GAMES: Game[] = [
  {
    id: "game_prediction_today",
    experienceId: "exp_tobo",
    type: "prediction",
    title: "Predicción del día",
    description: "¿Quién gana el juego de hoy?",
    points: 100,
    status: "open",
    configuration: {
      kind: "prediction",
      question: "¿Quién gana el juego de hoy?",
      options: [
        { id: "opt_leones", label: "Leones" },
        { id: "opt_tiburones", label: "Tiburones" },
      ],
      openAt: "2026-09-23T08:00:00.000Z",
      closeAt: "2026-09-24T06:00:00.000Z",
    },
  },
  {
    id: "game_trivia_flash",
    experienceId: "exp_tobo",
    type: "trivia",
    title: "Trivia relámpago",
    description: "5 preguntas. Elige y suma.",
    points: 250,
    status: "open",
    configuration: {
      kind: "trivia",
      questions: [
        {
          id: "q1",
          question: "¿Qué significa LVBP?",
          options: [
            "Liga Venezolana de Béisbol Profesional",
            "Liga de Verano de Béisbol Popular",
            "Liga Valencia de Béisbol y Pelota",
            "Liga Virtual de Béisbol Pro",
          ],
          correctAnswer: 0,
          explanation: "Es la liga profesional de béisbol de Venezuela.",
          points: 50,
        },
        {
          id: "q2",
          question: "¿Cuántos innings tiene un juego reglamentario?",
          options: ["6", "7", "9", "12"],
          correctAnswer: 2,
          explanation: "Un juego reglamentario se juega a 9 innings.",
          points: 50,
        },
        {
          id: "q3",
          question: "¿Con cuántos strikes se outea un bateador?",
          options: ["2", "3", "4", "5"],
          correctAnswer: 1,
          points: 50,
        },
        {
          id: "q4",
          question: "¿Cuántos outs tiene un equipo por inning?",
          options: ["1", "2", "3", "6"],
          correctAnswer: 2,
          points: 50,
        },
        {
          id: "q5",
          question: "¿Cómo se llama el jonrón con las bases llenas?",
          options: ["Grand slam", "Walk-off", "Bunt", "Wild pitch"],
          correctAnswer: 0,
          points: 50,
        },
      ],
    },
  },
  {
    id: "game_quick_pick",
    experienceId: "exp_tobo",
    type: "quick_challenge",
    title: "Reto relámpago",
    description: "Elige la correcta antes de que se acabe el tiempo.",
    points: 80,
    status: "open",
    configuration: {
      kind: "quick_challenge",
      variant: "speed_pick",
      question: "¿Cuántos strikes se necesitan para un out?",
      options: ["1", "2", "3", "4"],
      correctAnswer: 2,
      timeLimit: 12,
      points: 80,
    },
  },
];

export const MISSIONS: Mission[] = [
  {
    id: "mission_day",
    experienceId: "exp_tobo",
    title: "Misión de hoy",
    description: "Haz 1 predicción y responde 3 preguntas.",
    requirements: [
      { id: "req_pred", type: "prediction", count: 1 },
      { id: "req_trivia", type: "trivia", count: 3 },
    ],
    points: 500,
    startDate: "2026-09-23",
    endDate: "2026-09-24",
  },
  {
    id: "mission_hunter",
    experienceId: "exp_tobo",
    title: "Cazador del Tobo",
    description: "Un check-in en una tasca participante. El QR se activa después.",
    requirements: [{ id: "req_checkin", type: "checkin", count: 1 }],
    points: 1000,
    startDate: "2026-09-23",
    endDate: "2027-02-01",
  },
];

export const REWARDS: Reward[] = [
  {
    id: "reward_tobo",
    experienceId: "exp_tobo",
    name: "Tobo de cerveza",
    description: "Desbloquéalo con puntos y reclámalo después en una tasca.",
    pointsRequired: 800,
    status: "available",
  },
];

export const BADGES: Badge[] = [
  { id: "badge_first", name: "Primera jugada", tone: "bronze", icon: "trophy", rule: "first_play" },
  { id: "badge_predict", name: "Predictor", tone: "fire", icon: "fire", rule: "prediction" },
  { id: "badge_trivia", name: "Trivia", tone: "gold", icon: "medal", rule: "trivia" },
  { id: "badge_rank", name: "Top 3", tone: "rose", icon: "bolt", rule: "top_three" },
];

const seed = (id: string, userId: string, sourceType: PointsTransaction["sourceType"], sourceId: string, points: number, createdAt: string): PointsTransaction => ({
  id,
  userId,
  experienceId: "exp_tobo",
  sourceType,
  sourceId,
  points,
  createdAt,
});

export const SEED_TRANSACTIONS: PointsTransaction[] = [
  seed("tx_sofia_1", "user_sofia", "trivia", "hist_trivia_sofia", 640, "2026-09-20T15:00:00.000Z"),
  seed("tx_sofia_2", "user_sofia", "prediction", "hist_pred_sofia", 300, "2026-09-21T16:00:00.000Z"),
  seed("tx_sofia_3", "user_sofia", "mission", "hist_mission_sofia", 300, "2026-09-22T18:00:00.000Z"),
  seed("tx_diego_1", "user_diego", "trivia", "hist_trivia_diego", 500, "2026-09-20T14:00:00.000Z"),
  seed("tx_diego_2", "user_diego", "prediction", "hist_pred_diego", 280, "2026-09-21T17:00:00.000Z"),
  seed("tx_diego_3", "user_diego", "quick_challenge", "hist_quick_diego", 200, "2026-09-22T19:00:00.000Z"),
  seed("tx_mateo_1", "user_mateo", "trivia", "hist_trivia_mateo", 440, "2026-09-21T12:00:00.000Z"),
  seed("tx_mateo_2", "user_mateo", "prediction", "hist_pred_mateo", 300, "2026-09-22T12:30:00.000Z"),
  seed("tx_ana_1", "user_ana", "trivia", "hist_trivia_ana", 280, "2026-09-21T11:00:00.000Z"),
  seed("tx_ana_2", "user_ana", "quick_challenge", "hist_quick_ana", 180, "2026-09-22T20:00:00.000Z"),
];
