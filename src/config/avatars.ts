export interface RusherAvatar {
  id: string;
  name: string;
  src: string;
}

/** Ilustraciones originales. No son escudos ni marcas de los clubes. */
export const RUSHER_AVATARS: RusherAvatar[] = [
  { id: "magallanes", name: "Barco", src: "/avatars/magallanes.svg" },
  { id: "leones", name: "León", src: "/avatars/leones.svg" },
  { id: "tigres", name: "Tigre", src: "/avatars/tigres.svg" },
  { id: "tiburones", name: "Tiburón", src: "/avatars/tiburones.svg" },
  { id: "aguilas", name: "Águila", src: "/avatars/aguilas.svg" },
  { id: "caribes", name: "Velocidad", src: "/avatars/caribes.svg" },
  { id: "cardenales", name: "Cardenal", src: "/avatars/cardenales.svg" },
  { id: "bravos", name: "Valentía", src: "/avatars/bravos.svg" },
];

export const DEFAULT_AVATAR_ID = "rusher";

export const DEFAULT_AVATAR: RusherAvatar = {
  id: DEFAULT_AVATAR_ID,
  name: "Rusher",
  src: "/avatars/rusher.svg",
};

const BY_ID = new Map<string, RusherAvatar>(
  [DEFAULT_AVATAR, ...RUSHER_AVATARS].map((avatar) => [avatar.id, avatar]),
);

export function isSelectableAvatar(id: string) {
  return RUSHER_AVATARS.some((avatar) => avatar.id === id);
}

export function avatarById(id: string | null | undefined) {
  if (!id) return DEFAULT_AVATAR;
  return BY_ID.get(id) ?? null;
}
