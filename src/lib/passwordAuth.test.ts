import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectAuthMethod,
  loginWithPassword,
  registerWithPassword,
  validatePasswordFormat,
} from "../../lib/registration/pinAuth.mjs";

describe("detectAuthMethod", () => {
  it.each([
    ["123456", "pin"],
    ["  123456  ", "pin"],
    ["12345", "password"],
    ["1234567", "password"],
    ["", "password"],
    ["Abcdef12!", "password"],
    ["ñandú12!", "password"],
  ])("'%s' → %s", (input, expected) => {
    expect(detectAuthMethod(input)).toBe(expected);
  });
});

describe("validatePasswordFormat (servidor manda, esto es solo feedback)", () => {
  it.each([
    ["Abcdef1!", true],
    ["Ñandú12!", true],
    ["A1!bcdefgh", true],
    ["short1!", false],
    ["sinmayuscula1!", false],
    ["SINNUMERO!", false],
    ["SinSimbolo12", false],
    ["        ", false],
  ])("'%s' válido=%s", (input, expected) => {
    expect(validatePasswordFormat(input).ok).toBe(expected);
  });

  it("rechaza más de 128 caracteres", () => {
    expect(validatePasswordFormat(`Aa1!${"x".repeat(125)}`).ok).toBe(false);
  });
});

describe("handlers sin red (validación previa al RPC)", () => {
  it("registerWithPassword rechaza teléfono inválido sin llamar a red", async () => {
    const result = await registerWithPassword({ phone: "abc", fullName: "Nombre Apellido", alias: "alias_ok", pin: "482916", password: "Abcdef1!" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_PHONE" });
  });

  it("registerWithPassword rechaza contraseña débil sin llamar a red", async () => {
    const result = await registerWithPassword({ phone: "04241234567", fullName: "Nombre Apellido", alias: "alias_ok", pin: "482916", password: "debil" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_PASSWORD" });
  });

  it("loginWithPassword rechaza método desconocido con el código único", async () => {
    const result = await loginWithPassword({ phone: "04241234567", credential: "Abcdef1!", method: "huella" });
    expect(result).toMatchObject({ ok: false, code: "AUTH_INVALID" });
  });
});

describe("accountApi: enrutado del flujo con contraseña", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });

  function okResponse(body: Record<string, unknown>) {
    fetchMock.mockResolvedValue({ text: async () => JSON.stringify(body), status: 200 });
  }

  function lastBody() {
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(options.body) as Record<string, unknown>;
  }

  it("loginSmart usa la acción nueva con detección automática del servidor", async () => {
    const { loginSmart, detectCredentialKind, passwordMeetsPolicy } = await import("@/services/accountApi");
    expect(detectCredentialKind("482916")).toBe("pin");
    expect(detectCredentialKind("Clave123!")).toBe("password");
    expect(passwordMeetsPolicy("Clave123!")).toBe(true);
    expect(passwordMeetsPolicy("corta1!")).toBe(false);

    okResponse({ ok: true, token: "tok", currentUser: { id: "u1", alias: "a", handle: "@a", initials: "A", avatarColor: "#000" } });
    await loginSmart("+584241234567", "Clave123!");
    expect(lastBody()).toMatchObject({ action: "login-account-password", method: "auto" });
  });

  it("registerWithPassword envía PIN y contraseña juntos", async () => {
    const { registerWithPassword } = await import("@/services/accountApi");
    okResponse({ ok: true, token: "tok", currentUser: { id: "u1", alias: "a", handle: "@a", initials: "A", avatarColor: "#000" } });
    await registerWithPassword("+584241234567", "Nombre Apellido", "alias_ok", "482916", "Clave123!");
    expect(lastBody()).toMatchObject({
      action: "register-account-password",
      pin: "482916",
      password: "Clave123!",
    });
  });

  it("AUTH_INVALID llega como mensaje único (sin PASSWORD_NOT_SET)", async () => {
    const { loginSmart, FlowError } = await import("@/services/accountApi");
    okResponse({ ok: false, code: "AUTH_INVALID", error: "No pudimos validar tus credenciales." });
    const error = await loginSmart("+584241234567", "Otra123!").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FlowError);
    expect((error as InstanceType<typeof FlowError>).code).toBe("AUTH_INVALID");
    expect((error as Error).message).toBe("No pudimos validar tus credenciales.");
  });
});
