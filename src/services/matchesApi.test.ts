import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardEntry } from "@/types/pulse";

const { callRpc } = vi.hoisted(() => ({ callRpc: vi.fn() }));
vi.mock("@/services/accountApi", () => ({
  callRpc,
  readSessionToken: () => "test-session",
}));

import { loadCycleBoard, visibleMvpTascas } from "@/services/matchesApi";

const user = (id: string, alias: string) => ({
  id,
  alias,
  handle: `@${alias.toLowerCase()}`,
  initials: alias.slice(0, 1),
  avatarColor: "#000000",
});

function rankingRow(id: string, alias: string, points: number, position: number, isCurrentUser: boolean): LeaderboardEntry {
  return { user: user(id, alias), points, lifetimePoints: points, position, isCurrentUser };
}

describe("puntos de ciclo compartidos", () => {
  beforeEach(() => callRpc.mockReset());

  it("misma ronda devuelve 6 en puntos personales y ranking; ordena con esos 6", async () => {
    callRpc.mockImplementation(async (rpc: string) => {
      if (!rpc) return [];
      if (rpc === "pulse_cycle_board") return { ok: true, points: 6, entries: [
        rankingRow("u-ahead", "Lider", 9, 1, false),
        rankingRow("u-me", "Jugador", 6, 2, true),
        rankingRow("u-behind", "Otro", 4, 3, false),
      ] };
      throw new Error(`RPC inesperado: ${rpc}`);
    });

    const board = await loadCycleBoard("ronda_1");
    expect(board.points).toBe(6); // Perfil y Home toman este total personal.
    expect(board.mine?.points).toBe(6); // Ranking usa el mismo total.
    expect(board.mine?.position).toBe(2); // La posición se ordena usando los 6 PT.
  });

  it("separa ciclo actual y lifetime; los puntos de otra ronda no contaminan", async () => {
    callRpc.mockImplementation(async (rpc: string, args: Record<string, unknown>) => {
      if (!rpc) return [];
      if (rpc === "pulse_cycle_board") {
        const points = args.p_cycle === "lifetime" ? 22 : args.p_cycle === "ronda_2" ? 10 : 6;
        return { ok: true, points, entries: [rankingRow("u-me", "Jugador", points, 1, true)] };
      }
      throw new Error(`RPC inesperado: ${rpc}`);
    });

    const current = await loadCycleBoard("ronda_1");
    const nextRound = await loadCycleBoard("ronda_2");
    const lifetime = await loadCycleBoard("lifetime");
    expect(current.points).toBe(6);
    expect(current.mine?.points).toBe(6);
    expect(nextRound.points).toBe(10);
    expect(lifetime.points).toBe(22);
    expect(lifetime.points).not.toBe(current.points);
  });

  it("no oculta la desincronización entre puntos del usuario y su fila del ranking", async () => {
    callRpc.mockImplementation(async (rpc: string) => {
      if (rpc === "pulse_cycle_board") return { ok: true, points: 6, entries: [rankingRow("u-me", "Jugador", 0, 3, true)] };
      return [];
    });
    await expect(loadCycleBoard("ronda_1")).rejects.toThrow("no coincide con el ranking");
  });
});

describe("tascas públicas del MVP", () => {
  const target = {
    id: "venue-beethoven",
    name: "La Europea Beethoven",
    slug: "la-europea-beethoven",
    active: true,
    address: "Dirección completa",
    description: "Ficha completa existente",
    roundPrize: "Premio de ronda",
    prizeDetail: "Detalle del premio",
    logoUrl: "logo.png",
    imageUrl: "foto.png",
  };

  it("deja visible únicamente la ficha Europea Beethoven; excluye La Europea y demos", () => {
    const result = visibleMvpTascas([
      target,
      { id: "venue-alias", name: "La Europea", slug: "la-europea", active: true },
      { id: "venue-jose", name: "Tasca San José", slug: "tasca-san-jose", active: true },
      { id: "venue-other", name: "Tasca Central", slug: "tasca-central", active: true },
    ]);
    expect(result).toEqual([target]);
  });

  it("no duplica fichas coincidentes y conserva la ficha con más datos existentes", () => {
    const shortCopy = { id: "copy", name: "La Europea Beethoven", slug: "beethoven", active: true };
    const result = visibleMvpTascas([shortCopy, target]);
    expect(result).toEqual([target]);
    expect(visibleMvpTascas([{ ...target, active: false }])).toEqual([]);
  });
});
