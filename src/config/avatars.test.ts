import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, RUSHER_AVATARS, isSelectableAvatar } from "@/config/avatars";

describe("avatares de Rusher", () => {
  it("ofrece ocho identidades originales y un predeterminado", () => {
    expect(RUSHER_AVATARS).toHaveLength(8);
    expect(new Set(RUSHER_AVATARS.map((avatar) => avatar.id)).size).toBe(8);
    expect(isSelectableAvatar(DEFAULT_AVATAR.id)).toBe(false);
    expect(isSelectableAvatar("leones")).toBe(true);
    expect(isSelectableAvatar("escudo-oficial")).toBe(false);
    for (const avatar of [DEFAULT_AVATAR, ...RUSHER_AVATARS]) {
      expect(existsSync(new URL(`../../public${avatar.src}`, import.meta.url))).toBe(true);
    }
  });
});
