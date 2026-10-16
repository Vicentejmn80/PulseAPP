import { useCallback, useEffect, useState } from "react";
import { Refresh } from "@/components/admin/AdminFrame";
import { Avatar } from "@/components/ui/Avatar";
import { StandingsTable } from "@/components/lvbp/StandingsTable";
import { TabBar } from "@/components/ui/TabBar";
import { lvbpStandings } from "@/lib/lvbpStandings";
import { adminCall } from "@/services/adminConsoleApi";
import { listMatches, type BaseballMatch } from "@/services/matchesApi";

export function ClasificacionPage({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<ReturnType<typeof lvbpStandings> | null>(null);
  const [upcoming, setUpcoming] = useState<BaseballMatch[]>([]);
  const [leaders, setLeaders] = useState<{ handle: string; points: number; avatarId?: string | null }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listMatches()
      .then((matches) => {
        setRows(lvbpStandings(matches));
        setUpcoming(
          matches
            .filter((match) => !match.demo && !match.simulation && match.status !== "finished" && match.status !== "cancelled")
            .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
            .slice(0, 5),
        );
        setError("");
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "No se pudo cargar la tabla.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 45_000);
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("rusher-standings-refresh", load);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("rusher-standings-refresh", load);
    };
  }, [load]);

  useEffect(() => {
    if (!embedded) return;
    let alive = true;
    adminCall<{ players?: { handle: string; points: number; avatarId?: string | null }[] }>("pulse_admin_top_predictors")
      .then((result) => {
        if (alive) setLeaders(result.players ?? []);
      })
      .catch(() => {
        if (alive) setLeaders([]);
      });
    return () => {
      alive = false;
    };
  }, [embedded, rows?.latestCountedStart]);

  return (
    <div className={embedded ? "" : "flex h-full flex-col px-4 py-5 sm:px-6"}>
      <div className={embedded ? "" : "min-h-0 flex-1 overflow-y-auto pb-[calc(24px+env(safe-area-inset-bottom))]"}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold text-[#8B93A5]">Sale de los marcadores finalizados. No es el ranking de jugadores.</p>
          {embedded ? <Refresh busy={loading} onClick={load} /> : (
            <button type="button" onClick={load} className="min-h-[44px] rounded-full bg-[#C6FF3D] px-4 text-[13px] font-extrabold text-[#0B0D0F] active:scale-[0.98]">Actualizar</button>
          )}
        </div>
        {error ? (
          <div className="mb-4">
            <p className="rounded-[14px] border border-[#FF4D8D] px-4 py-3 text-[13px] font-bold text-[#FF4D8D]">{error}</p>
            <button type="button" onClick={load} className="mt-3 min-h-[44px] rounded-full bg-[#C6FF3D] px-4 text-[13px] font-extrabold text-[#0B0D0F]">Reintentar</button>
          </div>
        ) : null}
        {loading && !rows ? <div className="adm-shimmer mb-4 h-80 rounded-[18px]" aria-busy="true" aria-label="Cargando tabla" /> : null}
        <div className={embedded ? "grid gap-4 lg:grid-cols-[1.4fr_0.7fr]" : ""}>
          {rows ? <StandingsTable rows={rows.rows} excludedTies={rows.excludedTies} /> : null}
          {embedded ? (
            <aside className="flex flex-col gap-3">
              <section className="rounded-[14px] border border-[#2A2F33] p-4">
                <h3 className="text-[14px] font-extrabold">Próximos juegos</h3>
                {upcoming.length === 0 ? <p className="mt-2 text-[13px] text-[#8B93A5]">No hay juegos pendientes en Rusher.</p> : upcoming.map((match) => (
                  <p key={match.id} className="mt-2 text-[13px] font-semibold">{match.awayTeam} vs {match.homeTeam}</p>
                ))}
              </section>
              <section className="rounded-[14px] border border-[#2A2F33] p-4">
                <h3 className="text-[14px] font-extrabold">Top 5 pronosticadores</h3>
                {leaders.length === 0 ? <p className="mt-2 text-[13px] text-[#8B93A5]">Todavía no hay puntos de pronóstico, o la consulta no está aplicada.</p> : leaders.map((player, index) => (
                  <p key={player.handle} className="mt-2 flex items-center gap-2 text-[13px] font-extrabold">
                    <Avatar initials={player.handle.replace("@", "").slice(0, 1).toUpperCase()} bg="#12161A" avatarId={player.avatarId} size={24} />
                    {index + 1}. {player.handle} · {player.points} pts
                  </p>
                ))}
              </section>
            </aside>
          ) : null}
        </div>
      </div>
      {embedded ? null : <TabBar />}
    </div>
  );
}
