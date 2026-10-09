import { describe, expect, it } from "vitest";
import { pointsToPass, showZoneEllipsis, shortAlias, zoneBounds } from "@/lib/rankingView";

describe("ranking view", () => {
  it("abrevia el nombre y calcula los puntos para pasar", () => {
    expect(shortAlias("María Pérez")).toBe("María P.");
    expect(shortAlias("Leo")).toBe("Leo");
    expect(pointsToPass(40, 55)).toBe(16);
  });

  it("oculta la zona dentro del top y no repite filas en los puestos 11 a 13", () => {
    expect(zoneBounds(4, 20)).toBeNull();
    expect(zoneBounds(11, 20)).toEqual({ start: 11, end: 13 });
    expect(zoneBounds(12, 20)).toEqual({ start: 11, end: 14 });
    expect(zoneBounds(13, 20)).toEqual({ start: 11, end: 15 });
    expect(showZoneEllipsis(11)).toBe(false);
    expect(showZoneEllipsis(14)).toBe(true);
  });

  it("si soy el último solo deja vecinos de arriba, y funciona con pocos usuarios", () => {
    expect(zoneBounds(20, 20)).toEqual({ start: 18, end: 20 });
    expect(zoneBounds(5, 5)).toBeNull();
    expect(zoneBounds(1, 5000)).toBeNull();
    expect(zoneBounds(4000, 5000)).toEqual({ start: 3998, end: 4002 });
  });
});
