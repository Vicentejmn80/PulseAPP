import { describe, expect, it } from "vitest";
import { inAppBrowser, isAppleMobile, isInstalledDisplay, readInstallHidden, writeInstallDismissed } from "@/lib/pwaInstall";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("aviso de instalación", () => {
  it("distingue iPhone, navegador incrustado y app ya instalada", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(inAppBrowser("WhatsApp/2.24")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 Chrome/120")).toBe(false);
    expect(isInstalledDisplay(true, false)).toBe(true);
    expect(isInstalledDisplay(false, false)).toBe(false);
  });

  it("oculta el aviso 7 días después de cerrarlo", () => {
    const store = memory();
    const now = Date.parse("2026-10-12T20:00:00-04:00");
    expect(readInstallHidden(now, store)).toBe(false);
    writeInstallDismissed(now, store);
    expect(readInstallHidden(now + 1000, store)).toBe(true);
    expect(readInstallHidden(now + 8 * 24 * 60 * 60 * 1000, store)).toBe(false);
  });
});
