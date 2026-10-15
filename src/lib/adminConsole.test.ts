import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adjustmentSourceId,
  campaignRewardSource,
  classifyAdminFailure,
  pageWindow,
  settlementNotice,
  shouldRescorePrediction,
} from "@/lib/adminConsole";
import { chartHeights, previewCopy, userPresence, usersCsv, whatsappHref } from "@/lib/adminCrm";
import { adminActionLabel, adminCodeIsKnown } from "@/lib/adminLabels";

describe("acceso del panel", () => {
  it("separa un fallo de infraestructura de una cuenta sin permiso", () => {
    expect(classifyAdminFailure({ status: 403 }).kind).toBe("permission");
    expect(classifyAdminFailure({ status: 503, code: "ADMIN_UNAVAILABLE" }).kind).toBe("infrastructure");
    expect(classifyAdminFailure({ status: 503 }).message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(classifyAdminFailure({ status: 501, code: "ADMIN_MIGRATION_REQUIRED" }).kind).toBe("migration");
    expect(classifyAdminFailure({ network: true }).kind).toBe("network");
  });
});

describe("liquidación de pronósticos", () => {
  it("no vuelve a puntuar el mismo marcador ya procesado y sí corrige uno distinto", () => {
    expect(shouldRescorePrediction(true, true)).toBe(false);
    expect(shouldRescorePrediction(true, false)).toBe(true);
    expect(shouldRescorePrediction(false, true)).toBe(true);
    expect(settlementNotice(0, 0)).toMatch(/No se duplicaron puntos/);
    expect(settlementNotice(2, 40)).toMatch(/2 usuarios/);
    expect(settlementNotice(2, 40, true)).toMatch(/corregido/);
  });
});

describe("recompensa de campaña", () => {
  it("usa una sola clave por usuario y campaña", () => {
    expect(campaignRewardSource("camp_1", "user_1")).toBe("camp_1:user_1");
    expect(campaignRewardSource("camp_1", "user_1")).toBe(campaignRewardSource("camp_1", "user_1"));
    expect(campaignRewardSource(" camp_1 ", " user_1 ")).toBe("camp_1:user_1");
    expect(campaignRewardSource("", "user_1")).toBeNull();
    expect(adjustmentSourceId("req_12345678")).toBe("req_12345678");
    expect(adjustmentSourceId("corto")).toBeNull();
  });

  it("pagina sin saltarse el primer resultado", () => {
    expect(pageWindow(45, 2, 20)).toMatchObject({ page: 2, offset: 20, pages: 3 });
    expect(pageWindow(0, 4, 20).page).toBe(1);
  });
});

describe("etiquetas de auditoría", () => {
  it("traduce el evento y conserva el código cuando no hay traducción", () => {
    expect(adminActionLabel("bootstrap_step0")).toBe("Configuración inicial del administrador");
    expect(adminActionLabel("pulse_admin_set_result")).toBe("Resultado deportivo confirmado");
    expect(adminActionLabel("login")).toBe("Inicio de sesión");
    expect(adminCodeIsKnown("pulse_admin_set_result")).toBe(true);
    expect(adminActionLabel("pulse_unknown_event")).toBe("Actividad registrada");
    expect(adminCodeIsKnown("pulse_unknown_event")).toBe(false);
  });
});

describe("crm de la consola", () => {
  it("arma WhatsApp, CSV y el estado sin inventar un contacto", () => {
    expect(whatsappHref("+58 424-2349676", "Hola")).toBe("https://wa.me/584242349676?text=Hola");
    expect(whatsappHref("123", "Hola")).toBeNull();
    expect(usersCsv([{ alias: "Ana", phone: "+584241112233", createdAt: "2026-10-14", lastSessionAt: null, points: 10 }])).toContain("Ana");
    const now = Date.parse("2026-10-14T18:00:00Z");
    expect(userPresence({ createdAt: "2026-10-14T12:00:00Z", now })).toBe("new");
    expect(userPresence({ createdAt: "2026-10-01T12:00:00Z", lastSessionAt: "2026-10-14T12:00:00Z", now })).toBe("active");
    expect(userPresence({ createdAt: "2026-09-01T12:00:00Z", lastSessionAt: "2026-09-02T12:00:00Z", now })).toBe("inactive");
    expect(chartHeights([0, 2, 4])).toEqual([4, 50, 100]);
    expect(previewCopy(3, 120, 1)).toContain("3 usuarios ganan puntos");
  });
});

describe("migración del panel", () => {
  const sql = readFileSync("supabase/migrations/20261016000000_launch_console.sql", "utf8");

  it("exige sesión de administrador y no publica las consultas nuevas", () => {
    expect(sql).toContain("pulse_admin_check");
    expect(sql).toContain("usersToday");
    expect(sql).toContain("sessionsToday");
    expect(sql).toContain("primary key (campaign_id, user_id)");
    expect(sql).toContain("on conflict (source_type, source_id) do nothing");
    expect(sql).not.toMatch(/grant execute on function public\.pulse_admin_users[\s\S]{0,80}to anon/i);
    expect(sql).not.toContain("password_hash");
    expect(sql).not.toContain("pin_hash");
  });

  it("califica active y separa el rol de operador", () => {
    const next = readFileSync("supabase/migrations/20261017000000_admin_console_v2.sql", "utf8");
    const api = readFileSync("api/admin.ts", "utf8");
    expect(next).toContain("pulse_venues.active");
    expect(next).toContain("pulse_campaigns.active");
    expect(next).toContain("venue.active");
    expect(next).toContain("p.phone");
    expect(next).toContain("pulse_admin_require_super");
    expect(next).toContain("pulse_score_breakdown");
    expect(next).toContain("perform public.pulse_admin_actor(p_admin_key)");
    expect(next).not.toMatch(/grant execute on function public\.pulse_admin_whoami[\s\S]{0,80}to anon/i);
    expect(api).toContain('session.role === "operator"');
    expect(api).toContain("pulse_admin_preview_result");
  });

  it("apaga la creación de retos sin borrar el historial", () => {
    expect(sql).toContain("Los retos entre usuarios están deshabilitados.");
    expect(sql).not.toMatch(/drop table[^;]*pulse_retos/i);
  });
});
