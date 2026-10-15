import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUSHER_AVATARS, avatarById, isSelectableAvatar } from "@/config/avatars";

describe("avatares de Rusher", () => {
  it("ofrece los ocho equipos y rechaza un avatar viejo o arbitrario", () => {
    expect(RUSHER_AVATARS).toHaveLength(8);
    expect(new Set(RUSHER_AVATARS.map((avatar) => avatar.id)).size).toBe(8);
    expect(isSelectableAvatar("leones")).toBe(true);
    expect(isSelectableAvatar("navegantes")).toBe(true);
    expect(isSelectableAvatar("magallanes")).toBe(false);
    expect(isSelectableAvatar("escudo-oficial")).toBe(false);
    expect(avatarById(null)).toBeNull();
    expect(avatarById("magallanes")).toBeNull();
    for (const avatar of RUSHER_AVATARS) {
      expect(existsSync(new URL(`../../public${avatar.src}`, import.meta.url))).toBe(true);
    }
  });
});
