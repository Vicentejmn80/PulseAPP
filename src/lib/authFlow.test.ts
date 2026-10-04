import { describe, expect, it } from "vitest";
import { validatePin, uniqueViolationCode } from "../../lib/registration/pinAuth.mjs";
import { aliasKey, normalizePhone } from "../../lib/registration/otpAuth.mjs";
import { decideSession } from "./sessionGate";
import { isPredictionPath, isToboPath, predictionBackTarget, toboExitTarget } from "./toboNav";

describe("crear cuenta e inicio de sesión", () => {
  it("normaliza el mismo celular venezolano", () => {
    const canonical = "+584242349676";
    expect(normalizePhone("4242349676")).toBe(canonical);
    expect(normalizePhone("+584242349676")).toBe(canonical);
    expect(normalizePhone("00584242349676")).toBe(canonical);
  });

  it("trata el alias sin importar mayúsculas", () => {
    expect(aliasKey("Vicente2")).toBe("vicente2");
    expect(aliasKey("VICENTE2")).toBe(aliasKey("vicente2"));
  });

  it("acepta un PIN de 6 dígitos", () => {
    expect(validatePin("135790").ok).toBe(true);
  });

  it("rechaza PIN vacío, corto o obvio", () => {
    expect(validatePin("").ok).toBe(false);
    expect(validatePin("12345").ok).toBe(false);
    expect(validatePin("123456").ok).toBe(false);
    expect(validatePin("000000").ok).toBe(false);
    expect(validatePin("111111").ok).toBe(false);
    expect(validatePin("12ab56").ok).toBe(false);
  });

  it("mapea un choque de teléfono y de alias", () => {
    expect(uniqueViolationCode("pulse_profiles_phone_key")).toBe("PHONE_ALREADY_REGISTERED");
    expect(uniqueViolationCode("pulse_profiles_phone_normalized_uidx")).toBe("PHONE_ALREADY_REGISTERED");
    expect(uniqueViolationCode("pulse_profiles_alias_normalized_key")).toBe("ALIAS_ALREADY_TAKEN");
  });
});

describe("sesión", () => {
  it("entra si el token sigue siendo válido", () => {
    expect(decideSession({ hasToken: true, ok: true, hasUser: true })).toEqual({ status: "ready", clearToken: false });
  });

  it("no borra el token si la red falla", () => {
    expect(decideSession({ hasToken: true, networkError: true })).toEqual({ status: "guest", clearToken: false });
  });

  it("cierra la sesión local si el servidor la rechaza", () => {
    expect(decideSession({ hasToken: true, ok: false, hasUser: false })).toEqual({ status: "guest", clearToken: true });
  });

  it("sin token muestra autenticación", () => {
    expect(decideSession({ hasToken: false }).status).toBe("guest");
  });
});

describe("navegación de Juégate el Tobo", () => {
  it("mantiene Pulse como aplicación madre y Tobo como experiencia", () => {
    expect(isToboPath("/tobo")).toBe(true);
    expect(isToboPath("/tobo/partidos/m1")).toBe(true);
    expect(isToboPath("/")).toBe(false);
  });

  it("volver desde pronosticar regresa al home de Juégate el Tobo", () => {
    expect(isPredictionPath("/tobo/partidos/caracas-magallanes")).toBe(true);
    expect(predictionBackTarget()).toBe("/tobo");
    expect(predictionBackTarget()).not.toBe("/");
  });

  it("el botón Pulse sale de la experiencia", () => {
    expect(toboExitTarget()).toBe("/");
  });
});
