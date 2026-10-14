import { describe, expect, it } from "vitest";
import { qrVisitRpcArgs, qrVisitToken } from "./qrReward";

describe("qr de local aliado", () => {
  it("extrae el identificador de una URL de visita", () => {
    expect(qrVisitToken("https://pulse.example/q/qabc1234")).toBe("qabc1234");
    expect(qrVisitToken("https://pulse.example/tobo/q/qabc1234")).toBe("qabc1234");
  });

  it("acepta el identificador suelto y rechaza basura", () => {
    expect(qrVisitToken("qabc1234")).toBe("qabc1234");
    expect(qrVisitToken("")).toBeNull();
    expect(qrVisitToken("https://evil.example/admin?key=secret")).toBeNull();
    expect(qrVisitToken("a")).toBeNull();
  });

  it("la petición no lleva puntos elegidos por el cliente", () => {
    const args = qrVisitRpcArgs("sess_1", "qabc1234");
    expect(args).toEqual({ p_token: "sess_1", p_qr: "qabc1234" });
    expect(Object.keys(args).sort()).toEqual(["p_qr", "p_token"]);
  });
});
