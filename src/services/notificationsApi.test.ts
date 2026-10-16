import { beforeEach, describe, expect, it, vi } from "vitest";

const callRpc = vi.fn();

vi.mock("@/services/accountApi", () => ({
  callRpc: (...args: unknown[]) => callRpc(...args),
  readSessionToken: () => "session-token",
}));

describe("RPC de avisos", () => {
  beforeEach(() => {
    callRpc.mockReset();
    vi.resetModules();
  });

  it("acepta una lista vacía confirmada por el servidor", async () => {
    callRpc.mockResolvedValue({ ok: true, unread: 0, items: [] });
    const { listNotifications } = await import("./notificationsApi");
    await expect(listNotifications()).resolves.toEqual({ unread: 0, items: [] });
    expect(callRpc).toHaveBeenCalledWith("pulse_notifications_list", {
      p_token: "session-token",
      p_limit: 20,
      p_offset: 0,
    });
  });

  it("marca todas solo cuando el servidor responde ok", async () => {
    callRpc.mockResolvedValue({ ok: true });
    const { markAllNotificationsRead } = await import("./notificationsApi");
    await expect(markAllNotificationsRead()).resolves.toBeUndefined();
    expect(callRpc).toHaveBeenCalledWith("pulse_notifications_read_all", { p_token: "session-token" });
  });

  it("traduce la función ausente y no la trata como éxito", async () => {
    callRpc.mockRejectedValue(new Error("Could not find the function public.pulse_notifications_read_all(p_token) in the schema cache"));
    const { listNotifications, markAllNotificationsRead } = await import("./notificationsApi");
    await expect(markAllNotificationsRead()).rejects.toThrow("Los avisos todavía no están disponibles");
    callRpc.mockResolvedValue({ ok: false, error: "Entra de nuevo para ver tus avisos." });
    await expect(markAllNotificationsRead()).rejects.toThrow("Entra de nuevo para ver tus avisos.");
    callRpc.mockRejectedValue(new Error("Could not find the function public.pulse_notifications_list(p_token, p_limit, p_offset) in the schema cache"));
    await expect(listNotifications()).rejects.toThrow("Los avisos todavía no están disponibles");
  });
});