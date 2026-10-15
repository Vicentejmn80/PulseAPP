import { useEffect, useState, type FormEvent } from "react";
import { Banner, Chip, Empty, Field, Notice, Panel, Primary, inputClass } from "@/components/admin/AdminFrame";
import { exactHandle } from "@/lib/adminConsole";
import { adminActionLabel, adminCodeIsKnown } from "@/lib/adminLabels";
import { adminCall, asAdminFailure } from "@/services/adminConsoleApi";
import type { AdminFailure } from "@/lib/adminConsole";

interface AdminSeat {
  handle: string;
  alias: string;
  grantedAt: string;
  grantedBy: string;
  role?: string;
}

export function TeamAdminPage() {
  const [admins, setAdmins] = useState<AdminSeat[]>([]);
  const [handle, setHandle] = useState("");
  const [reason, setReason] = useState("");
  const [seatRole, setSeatRole] = useState("operator");
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function load() {
    adminCall<{ admins: AdminSeat[] }>("pulse_admin_team")
      .then((result) => {
        setAdmins(result.admins ?? []);
        setFailure(null);
      })
      .catch((error: unknown) => setFailure(asAdminFailure(error)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function grant(event: FormEvent) {
    event.preventDefault();
    const exact = exactHandle(handle);
    if (!exact) {
      setFailure({ kind: "validation", message: "Escribe el alias exacto, con @. No se acepta una coincidencia parcial." });
      return;
    }
    if (reason.trim().length < 8) {
      setFailure({ kind: "validation", message: "Escribe por qué recibe acceso." });
      return;
    }
    if (!window.confirm(`¿Dar acceso de administración a ${exact}? Seguirá usando su propia cuenta.`)) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await adminCall<{ ok: boolean; error?: string; handle?: string; role?: string }>("pulse_admin_grant", {
        p_handle: exact,
        p_reason: reason.trim(),
        p_role: seatRole,
      });
      if (!result.ok) throw new Error(result.error || "No se pudo otorgar el acceso.");
      setNotice(`${result.handle} quedó como ${result.role === "super" ? "super admin" : "operador"}.`);
      setHandle("");
      setReason("");
      load();
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(target: string) {
    if (reason.trim().length < 8) {
      setFailure({ kind: "validation", message: "Escribe el motivo antes de quitar el acceso." });
      return;
    }
    if (!window.confirm(`¿Quitar el acceso de ${target}?`)) return;
    setBusy(true);
    try {
      const result = await adminCall<{ ok: boolean; error?: string }>("pulse_admin_revoke", {
        p_handle: target,
        p_reason: reason.trim(),
      });
      if (!result.ok) throw new Error(result.error || "No se pudo quitar el acceso.");
      setNotice(`${target} ya no administra.`);
      load();
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-[28px] font-extrabold tracking-tight">Accesos</h2>
      <p className="mb-4 text-[14px] font-semibold text-[var(--adm-muted)]">Super admin ve todo. Operador solo ve Resultados y Usuarios. El servidor rechaza el resto.</p>
      <Banner failure={failure} />
      {notice ? <Notice>{notice}</Notice> : null}
      <Panel title="Administradores">
        {loading && <p className="text-[14px] font-semibold text-[var(--adm-muted)]">Cargando accesos…</p>}
        {!loading && admins.length === 0 ? <Empty>No hay administradores para mostrar.</Empty> : null}
        <ul className="flex flex-col gap-2">
          {admins.map((admin) => (
            <li key={admin.handle} className="rounded-2xl bg-[#0B0D0F] px-3 py-3 text-[13px]">
              <p className="font-extrabold">{admin.handle} <Chip tone={admin.role === "operator" ? "violet" : "accent"}>{admin.role === "operator" ? "Operador" : "Super admin"}</Chip></p>
              <p className="text-[var(--adm-muted)]">
                Desde {new Date(admin.grantedAt).toLocaleDateString("es-VE")} · otorgado por {adminCodeIsKnown(admin.grantedBy) ? adminActionLabel(admin.grantedBy) : admin.grantedBy}
              </p>
              <button type="button" disabled={busy} onClick={() => void revoke(admin.handle)} className="mt-2 min-h-11 font-extrabold text-[var(--adm-pink)]">Quitar acceso</button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Otorgar acceso">
        <form onSubmit={grant} className="flex max-w-[480px] flex-col gap-3">
          <Field label="Alias exacto">
            <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@alias" className={inputClass} />
          </Field>
          <Field label="Rol">
            <select value={seatRole} onChange={(event) => setSeatRole(event.target.value)} className={inputClass}>
              <option value="operator">Operador</option>
              <option value="super">Super admin</option>
            </select>
          </Field>
          <Field label="Motivo">
            <input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} />
          </Field>
          <Primary type="submit" disabled={busy}>Confirmar acceso</Primary>
        </form>
      </Panel>
    </div>
  );
}
