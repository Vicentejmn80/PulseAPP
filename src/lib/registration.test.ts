import { afterEach, describe, expect, it } from "vitest";
import {
  aliasKey,
  mapTwilioFailure,
  normalizePhone,
  validateAlias,
  whatsappOtpEnabled,
} from "../../lib/registration/otpAuth.mjs";

describe("teléfono canónico", () => {
  it("normaliza un celular venezolano de 10 dígitos", () => {
    expect(normalizePhone("4242349676")).toBe("+584242349676");
  });

  it("trata 0424, 0058 y +58 como el mismo número", () => {
    const canonical = "+584242349676";
    expect(normalizePhone("04242349676")).toBe(canonical);
    expect(normalizePhone("00584242349676")).toBe(canonical);
    expect(normalizePhone("+58 424 234 9676")).toBe(canonical);
  });

  it("rechaza un teléfono inválido", () => {
    expect(normalizePhone("123")).toBe("");
    expect(normalizePhone("")).toBe("");
  });
});

describe("alias", () => {
  it("acepta un alias válido", () => {
    expect(validateAlias("Vicente2")).toEqual({ ok: true, alias: "Vicente2", key: "vicente2" });
  });

  it("rechaza espacios, símbolos y menos de 3 caracteres", () => {
    expect(validateAlias("ab").ok).toBe(false);
    expect(validateAlias("hola mundo").ok).toBe(false);
    expect(validateAlias("vicente<script>").ok).toBe(false);
    expect(validateAlias("🔥").ok).toBe(false);
  });

  it("compara sin importar mayúsculas", () => {
    expect(aliasKey("Vicente2")).toBe(aliasKey("vicente2"));
    expect(aliasKey("VICENTE2")).toBe("vicente2");
  });
});

describe("ENABLE_WHATSAPP_OTP", () => {
  const previous = process.env.ENABLE_WHATSAPP_OTP;

  afterEach(() => {
    if (previous === undefined) delete process.env.ENABLE_WHATSAPP_OTP;
    else process.env.ENABLE_WHATSAPP_OTP = previous;
  });

  it("usa bypass cuando la variable está vacía", () => {
    delete process.env.ENABLE_WHATSAPP_OTP;
    expect(whatsappOtpEnabled()).toBe(false);
  });

  it("activa OTP con true o 1", () => {
    process.env.ENABLE_WHATSAPP_OTP = "true";
    expect(whatsappOtpEnabled()).toBe(true);
    process.env.ENABLE_WHATSAPP_OTP = "1";
    expect(whatsappOtpEnabled()).toBe(true);
  });
});

describe("errores de Twilio", () => {
  it("traduce sandbox no unido", () => {
    expect(mapTwilioFailure(400, { code: 63016 }).code).toBe("TWILIO_SANDBOX_NOT_JOINED");
  });

  it("traduce número inválido", () => {
    expect(mapTwilioFailure(400, { code: 21211 }).code).toBe("TWILIO_INVALID_NUMBER");
  });

  it("traduce credenciales inválidas sin filtrar secretos", () => {
    const mapped = mapTwilioFailure(401, { code: 20003, message: "Authenticate" });
    expect(mapped.code).toBe("TWILIO_AUTH_ERROR");
    expect(mapped.error).not.toMatch(/auth token|AC[0-9a-f]/i);
  });

  it("traduce rate limit", () => {
    expect(mapTwilioFailure(429, { code: 20429 }).code).toBe("OTP_RATE_LIMITED");
  });

  it("traduce un error desconocido", () => {
    expect(mapTwilioFailure(500, { message: "boom" }).code).toBe("TWILIO_ERROR");
  });

  it("explica cuando la cuenta exige plantilla y no texto libre", () => {
    expect(mapTwilioFailure(400, { code: 21654, message: "ContentSid Required" }).code).toBe("TWILIO_TEMPLATE_REQUIRED");
  });
});
