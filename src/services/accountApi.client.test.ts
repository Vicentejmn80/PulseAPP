import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn((
  _url: string,
  _key: string,
  options?: { auth?: { persistSession?: boolean; storageKey?: string } },
) => ({
  rpc: vi.fn(async () => ({ data: { ok: true, levels: [] }, error: null })),
  options,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (
    url: string,
    key: string,
    options?: { auth?: { persistSession?: boolean; storageKey?: string } },
  ) => createClient(url, key, options),
}));

describe("cliente de Supabase en el navegador", () => {
  beforeEach(() => {
    createClient.mockClear();
    vi.resetModules();
  });

  it("crea una sola instancia aunque se llamen varias RPC", async () => {
    const { callRpc } = await import("./accountApi");
    await callRpc("pulse_trivia_status", { p_token: "token" });
    await callRpc("pulse_load", { p_token: "token" });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient.mock.calls[0]?.[2]?.auth).toMatchObject({
      persistSession: false,
      storageKey: "pulse-rpc-auth",
    });
  });
});
