import { useEffect, useState } from "react";
import { StandingsTable } from "@/components/lvbp/StandingsTable";
import { TabBar } from "@/components/ui/TabBar";
import { lvbpStandings } from "@/lib/lvbpStandings";
import { adminCall } from "@/services/adminConsoleApi";
import { listMatches, type BaseballMatch } from "@/services/matchesApi";

export function ClasificacionPage({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<ReturnType<typeof lvbpStandings> | null>(null);
  const [upcoming, setUpcoming] = useState<BaseballMatch[]>([]);
  const [leaders, setLeaders] = useState<{ handle: string; points: number }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listMatches()
      .then((matches) => {
        if (!alive) return;
        setRows(lvbpStandings(matches));
        setUpcoming(
          matches
            .filter((match) => !match.demo && !match.simulation && match.status !== "finished" && match.status !== "cancelled")
            .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
            .slice(0, 5),
        );
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar la tabla.");
      });
    if (embedded) {
      adminCall<{ players?: { handle: string; points: number }[] }>("pulse_admin_top_predictors")
        .then((result) => {
          if (alive) setLeaders(result.players ?? []);
        })
        .catch(() => {
          if (alive) setLeaders([]);
        });
    }
    return () => {
      alive = false;
    };
  }, [embedded]);

  return (
    <div className={embedded ? "" : "flex h-full flex-col px-4 py-5 sm:px-6"}>
      <div className={embedded ? "" : "min-h-0 flex-1 overflow-y-auto"}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#CFFF00]">LVBP</p>
        <h2 className="mt-1 text-[28px] font-extrabold tracking-tight">Tabla de posiciones</h2>
        <p className="mb-4 mt-2 text-[14px] font-semibold text-[#8B93A5]">
          Esta tabla es de equipos. Sale solo de los marcadores finales guardados en Rusher. No consulta una fuente oficial de la LVBP y no es el ranking de jugadores.
        </p>
        {rows?.latestCountedStart ? (
          <p className="mb-4 text-[13px] font-bold text-[#8B93A5]">
            Último partido contabilizado: {new Date(rows.latestCountedStart).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        ) : null}
        {error && <p className="mb-4 rounded-2xl bg-[#14171A] px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {!rows && !error && <p className="text-[14px] font-semibold text-[#8B93A5]">Cargando tabla…</p>}
        <div className={embedded ? "grid gap-4 lg:grid-cols-[1.4fr_0.7fr]" : ""}>
          {rows && <StandingsTable rows={rows.rows} excludedTies={rows.excludedTies} />}
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
                  <p key={player.handle} className="mt-2 text-[13px] font-extrabold">{index + 1}. {player.handle} · {player.points} pts</p>
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
