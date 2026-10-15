import { useEffect, useState, type FormEvent } from "react";
import { Banner, Chip, Empty, Field, Panel, Primary, Skeleton, inputClass, when } from "@/components/admin/AdminFrame";
import { pageWindow } from "@/lib/adminConsole";
import { USER_PAGE_SIZE, userPresence, usersCsv, whatsappHref } from "@/lib/adminCrm";
import { formato } from "@/lib/format";
import { adminCall, asAdminFailure, AdminRequestError, type AdminMovement, type AdminUserRow } from "@/services/adminConsoleApi";
import type { AdminFailure } from "@/lib/adminConsole";

const PRESENCE = {
  new: { label: "Nuevo", tone: "cyan" },
  active: { label: "Activo", tone: "accent" },
  inactive: { label: "Inactivo", tone: "amber" },
  suspended: { label: "Suspendida", tone: "pink" },
} as const;

export function UsersAdminPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState("Hola, te escribe Rusher.");
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<{ user: AdminUserRow & { suspendedReason?: string | null }; movements: AdminMovement[] } | null>(null);
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [operator, setOperator] = useState(false);
  const [reason, setReason] = useState("");
  const [points, setPoints] = useState("");
  const [busy, setBusy] = useState(false);
  const pager = pageWindow(total, page, USER_PAGE_SIZE);

  function load(nextPage = page, nextQuery = query, nextStatus = status) {
    setLoading(true);
    setFailure(null);
    const offset = (Math.max(1, nextPage) - 1) * USER_PAGE_SIZE;
    const basic = { p_query: nextQuery, p_limit: USER_PAGE_SIZE, p_offset: offset };
    adminCall<{ ok: boolean; total: number; users: AdminUserRow[] }>("pulse_admin_users", {
      ...basic,
      p_status: nextStatus,
      p_sort: "newest",
    })
      .catch(async (error: unknown) => {
        if (error instanceof AdminRequestError && error.code === "ADMIN_MIGRATION_REQUIRED") {
          return adminCall<{ ok: boolean; total: number; users: AdminUserRow[] }>("pulse_admin_users", basic);
        }
        throw error;
      })
      .then((result) => {
        setUsers(result.users ?? []);
        setTotal(result.total ?? 0);
        setPicked([]);
      })
      .catch((error: unknown) => setFailure(asAdminFailure(error)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1, "");
    adminCall<{ role?: string }>("admin-whoami")
      .then((result) => setOperator(result.role === "operator"))
      .catch(() => setOperator(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openUser(id: string) {
    setSelected(id);
    setDetail(null);
    setFailure(null);
    adminCall<{ ok: boolean; error?: string; user: AdminUserRow & { suspendedReason?: string | null }; movements: AdminMovement[] }>("pulse_admin_user_ledger", {
      p_user_id: id,
      p_limit: 30,
    })
      .then((result) => {
        if (!result.ok) {
          setFailure({ kind: "validation", message: result.error || "No se pudo abrir el usuario." });
          return;
        }
        setDetail({ user: result.user, movements: result.movements ?? [] });
      })
      .catch((error: unknown) => setFailure(asAdminFailure(error)));
  }

  function chosenRows() {
    const ids = new Set(picked);
    return picked.length > 0 ? users.filter((user) => ids.has(user.id)) : users;
  }

  async function copyPhones() {
    const rows = chosenRows();
    const phones = rows.map((user) => user.phone).filter(Boolean);
    if (phones.length === 0) {
      setFailure({ kind: "validation", message: "Esta página no tiene teléfonos para copiar." });
      return;
    }
    try {
      await navigator.clipboard.writeText(phones.join("\n"));
      setNotice(`${phones.length} números copiados.`);
    } catch {
      setFailure({ kind: "validation", message: "El navegador no permitió copiar. Revisa el permiso del portapapeles." });
    }
  }

  function exportCsv() {
    const rows = chosenRows();
    const csv = usersCsv(rows.map((user) => ({
      alias: user.alias || user.handle,
      phone: user.phone,
      createdAt: user.createdAt,
      lastSessionAt: user.lastSessionAt,
      points: user.points,
    })));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rusher-usuarios.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggle(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function suspend(suspendUser: boolean) {
    if (!detail || operator) return;
    if (suspendUser && reason.trim().length < 8) {
      setFailure({ kind: "validation", message: "Escribe un motivo de al menos 8 caracteres." });
      return;
    }
    if (!window.confirm(suspendUser ? `¿Suspender a ${detail.user.handle}?` : `¿Reactivar a ${detail.user.handle}?`)) return;
    setBusy(true);
    try {
      const result = await adminCall<{ ok: boolean; error?: string }>("pulse_admin_set_suspension", {
        p_user_id: detail.user.id,
        p_suspend: suspendUser,
        p_reason: reason.trim(),
      });
      if (!result.ok) throw new Error(result.error || "No se pudo actualizar la cuenta.");
      setReason("");
      openUser(detail.user.id);
      load();
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!detail || operator) return;
    const amount = Number(points);
    if (!Number.isInteger(amount) || amount === 0) {
      setFailure({ kind: "validation", message: "Indica un número entero de puntos, distinto de cero." });
      return;
    }
    if (reason.trim().length < 8) {
      setFailure({ kind: "validation", message: "La corrección necesita un motivo." });
      return;
    }
    if (!window.confirm(`¿Registrar ${amount} puntos para ${detail.user.handle}? Queda auditado.`)) return;
    setBusy(true);
    try {
      const result = await adminCall<{ ok: boolean; error?: string }>("pulse_admin_adjust_points", {
        p_user_id: detail.user.id,
        p_points: amount,
        p_reason: reason.trim(),
        p_request_id: `adj_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      });
      if (!result.ok) throw new Error(result.error || "No se pudo registrar la corrección.");
      setPoints("");
      setReason("");
      openUser(detail.user.id);
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-[68ch] text-[14px] font-semibold text-[var(--adm-muted)]">
        El teléfono solo se muestra en esta consola. La última entrada es la sesión más reciente. Hay {USER_PAGE_SIZE} cuentas por página.
      </p>
      <Banner failure={failure} />
      {notice ? <p className="mb-4 rounded-[14px] bg-[var(--adm-cyan)] px-4 py-3 text-[13px] font-extrabold text-[#041018]">{notice}</p> : null}
      <form
        className="mb-4 grid gap-3 lg:grid-cols-[1.4fr_200px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          load(1, query, status);
        }}
      >
        <Field label="Alias, teléfono o identificador">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Filtro">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
            <option value="">Todos</option>
            <option value="new">Nuevos hoy</option>
            <option value="active24">Activos 24 h</option>
            <option value="inactive7">Inactivos 7 d+</option>
          </select>
        </Field>
        <div className="lg:pt-5">
          <Primary type="submit">Buscar</Primary>
        </div>
      </form>
      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <Field label="Mensaje de WhatsApp">
          <input value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} />
        </Field>
        <div className="lg:pt-5"><Primary onClick={() => void copyPhones()}>Copiar números</Primary></div>
        <div className="lg:pt-5"><Primary onClick={exportCsv}>Exportar CSV</Primary></div>
      </div>
      <Panel title={`${formato(total)} cuentas`} note={picked.length > 0 ? `${picked.length} seleccionadas en esta página.` : "Sin selección, copiar y exportar usan la página visible."}>
        {loading ? <Skeleton label="Cargando usuarios" /> : null}
        {!loading && users.length === 0 ? <Empty>No hay usuarios con esa búsqueda.</Empty> : null}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <thead className="text-[11px] uppercase text-[var(--adm-muted)]">
              <tr>
                <th className="py-2 pr-3"> </th>
                <th className="py-2 pr-3">Alias</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Teléfono</th>
                <th className="py-2 pr-3">Alta</th>
                <th className="py-2 pr-3">Última entrada</th>
                <th className="py-2 pr-3">Puntos</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const presence = PRESENCE[userPresence(user)];
                const link = whatsappHref(user.phone, message);
                return (
                  <tr key={user.id} className="border-t border-[var(--adm-line)]">
                    <td className="py-3 pr-3"><input type="checkbox" checked={picked.includes(user.id)} onChange={() => toggle(user.id)} aria-label={`Seleccionar ${user.handle}`} /></td>
                    <td className="py-3 pr-3">
                      <button type="button" onClick={() => openUser(user.id)} className="font-extrabold text-[var(--adm-accent)]">{user.handle}</button>
                      <p className="text-[12px] text-[var(--adm-muted)]">{user.alias}</p>
                    </td>
                    <td className="py-3 pr-3">{user.fullName || "—"}</td>
                    <td className="py-3 pr-3">{user.phone}</td>
                    <td className="py-3 pr-3">{when(user.createdAt)}</td>
                    <td className="py-3 pr-3">{user.lastSessionAt ? when(user.lastSessionAt) : "Sin sesión"}</td>
                    <td className="py-3 pr-3 font-extrabold tabular-nums">{formato(user.points)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={presence.tone}>{presence.label}</Chip>
                        {link ? <a className="font-extrabold text-[var(--adm-wa)]" href={link} target="_blank" rel="noreferrer">WhatsApp</a> : <span className="text-[var(--adm-muted)]">Sin teléfono válido</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 md:hidden">
          {users.map((user) => {
            const presence = PRESENCE[userPresence(user)];
            const link = whatsappHref(user.phone, message);
            return (
              <article key={user.id} className="rounded-[14px] border border-[var(--adm-line)] p-3">
                <label className="flex items-center gap-2 text-[14px] font-extrabold">
                  <input type="checkbox" checked={picked.includes(user.id)} onChange={() => toggle(user.id)} />
                  <button type="button" onClick={() => openUser(user.id)} className="text-[var(--adm-accent)]">{user.handle}</button>
                </label>
                <p className="mt-1 text-[13px] text-[var(--adm-muted)]">{user.fullName || user.alias} · {user.phone}</p>
                <p className="mt-1 text-[13px]">Alta {when(user.createdAt)} · Entrada {user.lastSessionAt ? when(user.lastSessionAt) : "sin sesión"}</p>
                <p className="mt-2 font-extrabold tabular-nums">{formato(user.points)} pts</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip tone={presence.tone}>{presence.label}</Chip>
                  {link ? <a className="font-extrabold text-[var(--adm-wa)]" href={link} target="_blank" rel="noreferrer">WhatsApp</a> : null}
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-[13px] font-extrabold">
          <button type="button" disabled={pager.page <= 1} onClick={() => { setPage(pager.page - 1); load(pager.page - 1); }} className="min-h-11 disabled:opacity-40">Anterior</button>
          <span>Página {pager.page} de {pager.pages}</span>
          <button type="button" disabled={pager.page >= pager.pages} onClick={() => { setPage(pager.page + 1); load(pager.page + 1); }} className="min-h-11 disabled:opacity-40">Siguiente</button>
        </div>
      </Panel>
      {selected && detail && (
        <Panel title={detail.user.handle}>
          <p className="text-[14px] font-semibold text-[var(--adm-muted)]">
            {detail.user.fullName || detail.user.alias} · {detail.user.phone} · {detail.user.city || "Sin ciudad"} · {formato(detail.user.points)} puntos
          </p>
          {operator ? <p className="mt-3 text-[13px] font-bold text-[var(--adm-amber)]">Un operador no ajusta puntos ni suspende cuentas.</p> : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <form onSubmit={adjust} className="flex flex-col gap-3">
                <Field label="Corrección de puntos">
                  <input value={points} onChange={(event) => setPoints(event.target.value)} inputMode="numeric" className={inputClass} />
                </Field>
                <Field label="Motivo">
                  <input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} />
                </Field>
                <Primary type="submit" disabled={busy}>Registrar corrección</Primary>
              </form>
              <div className="flex flex-col gap-3">
                <Primary disabled={busy} onClick={() => void suspend(!detail.user.suspendedAt)}>
                  {detail.user.suspendedAt ? "Reactivar cuenta" : "Suspender cuenta"}
                </Primary>
                <p className="text-[12px] font-semibold text-[var(--adm-muted)]">La suspensión cierra el acceso de esa sesión. No cambia la contraseña.</p>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {detail.movements.length === 0 ? <Empty>Esta cuenta no tiene movimientos.</Empty> : null}
            {detail.movements.map((movement) => (
              <p key={movement.id} className="rounded-[14px] bg-[#0B0D0F] px-3 py-3 text-[13px]">
                <span className="font-extrabold">{movement.type}</span> · <span className={movement.points < 0 ? "text-[var(--adm-pink)]" : "text-[var(--adm-accent)]"}>{movement.points} pts</span>
                <span className="mt-1 block text-[var(--adm-muted)]">{new Date(movement.at).toLocaleString("es-VE")} {movement.reason ? `· ${movement.reason}` : ""}</span>
              </p>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
