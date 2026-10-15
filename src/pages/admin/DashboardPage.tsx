import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Empty, Metric, Panel, Primary, Refresh, Skeleton, when } from "@/components/admin/AdminFrame";
import { chartHeights } from "@/lib/adminCrm";
import { formato } from "@/lib/format";
import { adminActionLabel, adminCodeIsKnown } from "@/lib/adminLabels";
import { adminCall, asAdminFailure, type Overview } from "@/services/adminConsoleApi";
import type { AdminFailure } from "@/lib/adminConsole";

function amount(value: number | undefined) {
  return value === undefined ? "No disponible" : formato(value);
}

export function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      adminCall<Overview>("pulse_admin_overview")
        .then((next) => {
          if (!alive) return;
          setData(next);
          setFailure(null);
        })
        .catch((error: unknown) => {
          if (alive) setFailure(asAdminFailure(error));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, 45_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [tick]);

  const activity = (data?.activity ?? []).slice(0, 10);
  const signups = data?.signups ?? [];
  const heights = chartHeights(signups.map((item) => Number(item.count) || 0));

  return (
    <div>
      <p className="mb-4 max-w-[68ch] text-[14px] font-semibold leading-relaxed text-[var(--adm-muted)]">
        Cifras reales de la base de datos.
        {data?.generatedAt ? ` Consultadas ${when(data.generatedAt)}.` : ""}
        {" "}Un inicio de sesión es una sesión creada; no significa que la persona siga conectada.
      </p>
      <div className="mb-4 flex justify-end"><Refresh busy={loading} onClick={() => { setLoading(true); setTick((value) => value + 1); }} /></div>
      <Banner failure={failure} />
      {loading && !data ? <Skeleton label="Cargando resumen" /> : null}
      {!loading && !data && failure ? <Primary onClick={() => { setLoading(true); setTick((value) => value + 1); }}>Reintentar</Primary> : null}
      {!loading && !data && !failure && <Empty>No hay indicadores para mostrar.</Empty>}
      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Usuarios totales" value={formato(data.users)} note={data.usersToday === undefined ? "Altas de hoy no disponibles en esta consulta." : `+${formato(data.usersToday)} hoy`} tone="accent" />
            <Metric label="Activos 24 h" value={amount(data.sessions24h ?? data.sessionsToday)} note="Personas distintas con una sesión creada. No es presencia en vivo." tone="cyan" />
            <Metric label="Pronósticos hoy" value={amount(data.predictionsToday)} note="Pronósticos guardados desde la medianoche de Caracas." tone="violet" />
            <Metric label="Puntos entregados" value={formato(data.pointsDistributed)} note="Suma de movimientos positivos. No es el saldo actual." tone="amber" />
          </div>
          <div className="mb-4 grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
            <Panel title="Registros últimos 14 días" note="Cuentas nuevas por día, hora de Caracas.">
              {signups.length === 0 ? <Empty>La consulta actual todavía no trae la serie de 14 días.</Empty> : (
                <div className="flex items-end gap-1">
                  {signups.map((item, index) => (
                    <div key={`${item.day}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[10px] font-extrabold tabular-nums text-[var(--adm-ink)]">{item.count}</span>
                      <div className="w-full rounded-t-[6px] bg-[var(--adm-accent)]" style={{ height: `${heights[index]}px` }} />
                      <span className="text-[10px] font-bold text-[var(--adm-muted)]">{item.day}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Requiere acción">
              <ul className="flex flex-col gap-2 text-[14px] font-extrabold">
                <li><Link className="text-[var(--adm-amber)]" to="/admin/beisbol">{formato(data.matchesAwaiting ?? 0)} juegos sin marcador</Link></li>
                <li><Link className="text-[var(--adm-pink)]" to="/admin/beisbol">{formato(data.predictionsPending)} pronósticos sin liquidar</Link></li>
                <li><Link className="text-[var(--adm-cyan)]" to="/admin/usuarios">{amount(data.usersToday)} usuarios nuevos hoy</Link></li>
              </ul>
              <p className="mt-3 text-[12px] font-semibold text-[var(--adm-muted)]">No hay un registro de canjes pendientes ni de “ya contactado”. Esas dos cifras no se inventan.</p>
            </Panel>
          </div>
          <Panel title="Actividad reciente" note="Se actualiza sola cada 45 segundos. Cada fila sale de un registro existente.">
            {data.activity === undefined ? (
              <Empty>La consulta actual todavía no incluye la actividad reciente.</Empty>
            ) : activity.length === 0 ? (
              <Empty>Todavía no hay actividad para mostrar.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {activity.map((event, index) => (
                  <li key={`${event.at}-${event.kind}-${index}`} className="grid gap-1 rounded-[14px] bg-[#0B0D0F] px-3 py-3 text-[13px] sm:grid-cols-[160px_1fr]">
                    <span className="font-semibold text-[var(--adm-muted)]">{when(event.at)}</span>
                    <span>
                      <span className="font-extrabold">{adminActionLabel(event.kind)}</span>
                      <span className="text-[var(--adm-muted)]"> · {event.actor || "Sin responsable"}</span>
                      {event.entity ? <span className="text-[var(--adm-muted)]"> · {event.entity}</span> : null}
                      {event.ok === false ? <span className="text-[var(--adm-pink)]"> · no se completó</span> : null}
                      {!adminCodeIsKnown(event.kind) ? (
                        <details className="mt-1 text-[12px] text-[var(--adm-muted)]">
                          <summary>Detalle técnico</summary>
                          {event.kind}
                        </details>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
