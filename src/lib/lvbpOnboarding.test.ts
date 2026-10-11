import { describe, expect, it } from "vitest";
import {
  LVBP_ONBOARDING_STEPS,
  clearOnboarding,
  onboardingDelayMs,
  onboardingIndexForPath,
  onboardingStepsMatchTabs,
  readOnboardingDone,
  writeOnboardingDone,
} from "@/lib/lvbpOnboarding";
import { TOBO_TABS } from "@/lib/toboTabs";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("introducción LVBP", () => {
  it("explica exactamente las pestañas reales, sin inventar Trivias como pestaña", () => {
    expect(onboardingStepsMatchTabs()).toBe(true);
    expect(LVBP_ONBOARDING_STEPS.map((step) => step.title)).toEqual(TOBO_TABS.map((tab) => tab.label));
    expect(LVBP_ONBOARDING_STEPS.some((step) => step.title === "Trivias")).toBe(false);
    expect(LVBP_ONBOARDING_STEPS[0]?.body).toContain("trivias del día");
    expect(LVBP_ONBOARDING_STEPS[3]?.title).toBe("Tascas");
  });

  it("guarda el cierre por cuenta y no lo repite hasta que se pide de nuevo", () => {
    const store = memoryStore();
    expect(readOnboardingDone("user_a", store)).toBe(false);
    writeOnboardingDone("user_a", store);
    expect(readOnboardingDone("user_a", store)).toBe(true);
    expect(readOnboardingDone("user_b", store)).toBe(false);
    clearOnboarding("user_a", store);
    expect(readOnboardingDone("user_a", store)).toBe(false);
  });

  it("espera a que termine la animación de entrada y no se monta durante el registro", () => {
    expect(onboardingDelayMs(false, false)).toBeGreaterThan(0);
    expect(onboardingDelayMs(true, false)).toBe(0);
    expect(onboardingDelayMs(false, true)).toBe(0);
  });

  it("reconoce la sección actual sin bloquear rutas que no son pestañas", () => {
    expect(onboardingIndexForPath("/tobo")).toBe(0);
    expect(onboardingIndexForPath("/tobo/mi-quiniela")).toBe(1);
    expect(onboardingIndexForPath("/tobo/partidos/lvbp_1")).toBe(1);
    expect(onboardingIndexForPath("/tobo/ranking")).toBe(2);
    expect(onboardingIndexForPath("/tobo/tascas")).toBe(3);
    expect(onboardingIndexForPath("/tobo/venue/la-europea-beethoven")).toBe(3);
    expect(onboardingIndexForPath("/tobo/profile")).toBe(4);
    expect(onboardingIndexForPath("/tobo/trivias")).toBe(0);
    expect(onboardingIndexForPath("/tobo/ligas")).toBeNull();
  });
});
