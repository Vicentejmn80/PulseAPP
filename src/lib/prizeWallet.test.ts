import { describe, expect, it } from "vitest";
import { mapsQuery, voucherDaysLeft, voucherLabel, voucherStatus } from "@/lib/prizeWallet";

const future = "2099-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";

describe("billetera de premios", () => {
  it("marca vencido cuando pasan los 14 días", () => {
    expect(voucherStatus("assigned", past)).toBe("expired");
    expect(voucherLabel("expired", 0)).toBe("Vencido");
  });

  it("un canjeado no vuelve a estar activo", () => {
    expect(voucherStatus("redeemed", future)).toBe("redeemed");
    expect(voucherLabel("redeemed", 3)).toBe("Canjeado");
  });

  it("cuenta los días que faltan", () => {
    const now = Date.parse("2026-10-04T12:00:00.000Z");
    expect(voucherDaysLeft("2026-10-18T12:00:00.000Z", now)).toBe(14);
    expect(voucherLabel("assigned", 14)).toBe("Quedan 14 días");
  });

  it("arma el enlace de mapas con coordenadas o dirección", () => {
    expect(mapsQuery({ lat: 10.5, lng: -66.9 })).toContain("query=10.5,-66.9");
    expect(mapsQuery({ address: "Calle Madrid" })).toContain("Calle%20Madrid");
    expect(mapsQuery({ address: "Por confirmar" })).toBe("");
  });
});
