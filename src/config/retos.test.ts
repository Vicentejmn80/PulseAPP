import { describe, expect, it } from "vitest";
import { RETOS_CUENTAN_PARA_PREMIO_RONDA, maxRetoStake, retoStakeAllowed } from "./retos";

describe("apuesta de retos", () => {
  it("no deja apostar más del tope, del 25 % ni de los puntos que hay", () => {
    expect(RETOS_CUENTAN_PARA_PREMIO_RONDA).toBe(false);
    expect(maxRetoStake(100)).toBe(20);
    expect(maxRetoStake(40)).toBe(10);
    expect(maxRetoStake(10)).toBe(2);
    expect(maxRetoStake(4)).toBe(1);
    expect(retoStakeAllowed(2, 10)).toBe(true);
    expect(retoStakeAllowed(5, 10)).toBe(false);
    expect(retoStakeAllowed(20, 100)).toBe(true);
    expect(retoStakeAllowed(21, 100)).toBe(false);
    expect(retoStakeAllowed(1, 100)).toBe(false);
  });
});
