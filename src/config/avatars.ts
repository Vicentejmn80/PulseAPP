export interface RusherAvatar {
  id: string;
  name: string;
  src: string;
}

export const RUSHER_AVATARS: RusherAvatar[] = [
  { id: "tiburones", name: "Tiburones", src: "/avatars/tiburones.webp" },
  { id: "aguilas", name: "Águilas", src: "/avatars/aguilas.webp" },
  { id: "tigres", name: "Tigres", src: "/avatars/tigres.webp" },
  { id: "cardenales", name: "Cardenales", src: "/avatars/cardenales.webp" },
  { id: "bravos", name: "Bravos", src: "/avatars/bravos.webp" },
  { id: "caribes", name: "Caribes", src: "/avatars/caribes.webp" },
  { id: "leones", name: "Leones", src: "/avatars/leones.webp" },
  { id: "navegantes", name: "Navegantes", src: "/avatars/navegantes.webp" },
];

const BY_ID = new Map(RUSHER_AVATARS.map((avatar) => [avatar.id, avatar]));

export function isSelectableAvatar(id: string | null | undefined) {
  return Boolean(id && BY_ID.has(id));
}

export function avatarById(id: string | null | undefined) {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}
