import { useEffect, useState, type FormEvent } from "react";
import { Banner, Chip, Empty, Field, Notice, Panel, Primary, Refresh, Skeleton, inputClass, when } from "@/components/admin/AdminFrame";
import { Avatar } from "@/components/ui/Avatar";
import { adminActionLabel, adminCodeIsKnown } from "@/lib/adminLabels";
import { adminCall, asAdminFailure, type AdminMovement } from "@/services/adminConsoleApi";
import type { AdminFailure } from "@/lib/adminConsole";

export function LedgerAdminPage() {
  const [type, setType] = useState("");
  const [movements, setMovements] = useState<AdminMovement[]>([]);
  const [audit, setAudit] = useState<{ at: string; action: string; target: string | null; ok: boolean; handle: string; phase: string | null }[]>([]);
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      adminCall<{ movements: AdminMovement[] }>("pulse_admin_ledger", { p_type: type, p_limit: 40, p_offset: 0 }),
      adminCall<{ events: typeof audit }>("pulse_admin_audit_recent", { p_limit: 30 }),
    ])
      .then(([ledger, events]) => {
        if (!alive) return;
        setMovements(ledger.movements ?? []);
        setAudit(events.events ?? []);
      })
      .catch((error: unknown) => {
        if (alive) setFailure(asAdminFailure(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [type, reload, tick]);

  async function adjust(event: FormEvent) {
    event.preventDefault();
    const amount = Number(points);
    if (!Number.isInteger(amount) || amount === 0 || reason.trim().length < 8) {
      setFailure({ kind: "validation", message: "Indica puntos distintos de cero y un motivo de al menos 8 caracteres." });
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const found = await adminCall<{ users: { id: string; handle: string }[] }>("pulse_admin_users", {
        p_query: handle.trim(),
        p_limit: 5,
        p_offset: 0,
        p_status: "",
        p_sort: "newest",
      });
      const exact = (found.users ?? []).find((user) => user.handle.toLowerCase() === handle.trim().toLowerCase());
      if (!exact) throw new Error("No hay una cuenta con ese alias exacto.");
      if (!window.confirm(`¿Ajustar ${amount} puntos a ${exact.handle}? Queda auditado.`)) return;
      const result = await adminCall<{ ok: boolean; error?: string }>("pulse_admin_adjust_points", {
        p_user_id: exact.id,
        p_points: amount,
        p_reason: reason.trim(),
        p_request_id: `adj_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      });
      if (!result.ok) throw new Error(result.error || "No se pudo registrar el ajuste.");
      setNotice(`Ajuste de ${amount} pts registrado para ${exact.handle}.`);
      setPoints("");
      setReason("");
      setReload((value) => value + 1);
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-[28px] font-extrabold tracking-tight">Puntos y auditoría</h2>
      <div className="mb-4 flex justify-end"><Refresh busy={loading} onClick={() => { setLoading(true); setTick((value) => value + 1); }} /></div>
      <Banner failure={failure} />
      {!loading && failure && movements.length === 0 ? <Primary onClick={() => { setLoading(true); setTick((value) => value + 1); }}>Reintentar</Primary> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      <Panel title="Ajuste manual" note="Solo un super admin. El motivo queda en el movimiento y en la auditoría.">
        <form onSubmit={adjust} className="grid gap-3 lg:grid-cols-[1fr_140px_1.4fr_auto]">
          <Field label="Alias exacto"><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@alias" className={inputClass} /></Field>
          <Field label="Puntos"><input value={points} onChange={(event) => setPoints(event.target.value)} inputMode="numeric" className={inputClass} /></Field>
          <Field label="Motivo"><input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} /></Field>
          <div className="lg:pt-5"><Primary type="submit" disabled={busy}>Registrar</Primary></div>
        </form>
      </Panel>
      <label className="mb-4 block text-[12px] font-extrabold text-[var(--adm-muted)]">
        Tipo de movimiento
        <select value={type} onChange={(event) => { setLoading(true); setType(event.target.value); }} className="mt-1 h-12 w-full max-w-[280px] rounded-2xl border border-[#2A2F33] bg-[#14171A] px-3 text-[15px] font-bold">
          <option value="">Todos</option>
          <option value="prediction">Pronóstico</option>
          <option value="qr_scan">QR de visita</option>
          <option value="campaign_reward">Campaña</option>
          <option value="admin_adjust">Ajustes</option>
          <option value="trivia">Trivia</option>
        </select>
      </label>
      {loading ? <Skeleton label="Cargando movimientos" /> : null}
      <Panel title="Movimientos">
        {movements.length === 0 && !loading ? <Empty>No hay movimientos de ese tipo.</Empty> : null}
        <ul className="flex flex-col gap-2">
          {movements.map((movement) => (
            <li key={movement.id} className="rounded-2xl bg-[#0B0D0F] px-3 py-3 text-[13px]">
              <p className="flex flex-wrap items-center gap-2 font-extrabold">
                <Avatar initials={(movement.handle || "?").replace("@", "").slice(0, 1).toUpperCase()} bg="#12161A" avatarId={movement.avatarId} size={28} />
                {movement.handle} · <Chip tone={movement.type === "admin_adjust" ? "amber" : movement.type === "qr_scan" ? "cyan" : movement.type === "campaign_reward" ? "violet" : "accent"}>{adminActionLabel(movement.type)}</Chip> · <span className={movement.points < 0 ? "text-[var(--adm-pink)]" : "text-[var(--adm-accent)]"}>{movement.points > 0 ? `+${movement.points}` : movement.points} pts</span>
              </p>
              <p className="text-[var(--adm-muted)]">
                {when(movement.at)}
                {movement.matchId ? ` · partido ${movement.matchId}` : ""}
                {movement.campaignId ? ` · campaña ${movement.campaignId}` : ""}
                {movement.reason ? ` · ${movement.reason}` : ""}
                {movement.adminId ? ` · admin ${movement.adminId}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Auditoría">
        {audit.length === 0 && !loading ? <Empty>Todavía no hay auditoría.</Empty> : null}
        <ul className="flex flex-col gap-2">
          {audit.map((event, index) => (
            <li key={`${event.at}-${index}`} className="rounded-2xl bg-[#0B0D0F] px-3 py-3 text-[13px]">
              <p className="font-extrabold">{event.handle} · {adminActionLabel(event.action)} · {event.ok ? "completada" : "no se completó"}</p>
              {!adminCodeIsKnown(event.action) ? <p className="text-[12px] text-[var(--adm-muted)]">Detalle técnico: {event.action}</p> : null}
              <p className="text-[var(--adm-muted)]">{when(event.at)} {event.target ? `· ${event.target}` : ""} {event.phase ? `· ${event.phase === "attempt" ? "antes de ejecutar" : "resultado"}` : ""}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
