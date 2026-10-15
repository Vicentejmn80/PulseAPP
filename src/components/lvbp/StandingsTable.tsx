import { formatGamesBehind, formatWinPct, type StandingRow } from "@/lib/lvbpStandings";

export function StandingsTable({ rows, excludedTies }: { rows: StandingRow[]; excludedTies: number }) {
  if (rows.length === 0) {
    return <p className="rounded-[14px] px-4 py-6 text-center text-[14px] font-semibold text-[#8B93A5]">Todavía no hay resultados finales para armar la tabla.</p>;
  }
  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <caption className="sr-only">Clasificación de equipos de la LVBP</caption>
          <thead className="text-[11px] uppercase tracking-wide text-[#8B93A5]">
            <tr>
              <th className="py-2 pr-3 font-extrabold">Pos</th>
              <th className="py-2 pr-3 font-extrabold">Equipo</th>
              <th className="py-2 pr-3 font-extrabold">PJ</th>
              <th className="py-2 pr-3 font-extrabold">PG</th>
              <th className="py-2 pr-3 font-extrabold">PP</th>
              <th className="py-2 pr-3 font-extrabold">PCT</th>
              <th className="py-2 pr-3 font-extrabold">DIF</th>
              <th className="py-2 font-extrabold">Racha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team} className="border-t border-[#2A2F33]">
                <td className="py-3 pr-3 font-extrabold">{row.rank}</td>
                <td className="py-3 pr-3 font-extrabold">{row.team}</td>
                <td className="py-3 pr-3 tabular-nums">{row.played}</td>
                <td className="py-3 pr-3 tabular-nums">{row.wins}</td>
                <td className="py-3 pr-3 tabular-nums">{row.losses}</td>
                <td className="py-3 pr-3 tabular-nums">{formatWinPct(row.winPct)}</td>
                <td className="py-3 pr-3 tabular-nums">{formatGamesBehind(row.gamesBehind)}</td>
                <td className="py-3">
                  <span className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${row.streak.startsWith("P") ? "bg-[#FF4D8D] text-white" : "bg-[#C6FF3D] text-[#0B0D0F]"}`}>{row.streak || "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <article key={`card-${row.team}`} className="rounded-[14px] border border-[#2A2F33] p-3 text-[13px]">
            <p className="font-extrabold">{row.rank}. {row.team}</p>
            <p className="mt-1 text-[#8B93A5]">JJ {row.played} · G {row.wins} · P {row.losses} · PCT {formatWinPct(row.winPct)} · DIF {formatGamesBehind(row.gamesBehind)} · {row.streak || "sin racha"}</p>
          </article>
        ))}
      </div>
      <p className="mt-3 text-[12px] font-semibold text-[#8B93A5]">
        El porcentaje es victorias entre partidos jugados. Si dos equipos empatan en porcentaje, comparten puesto.
        {excludedTies > 0 ? ` ${excludedTies} marcador${excludedTies === 1 ? "" : "es"} empatado${excludedTies === 1 ? "" : "s"} no entra${excludedTies === 1 ? "" : "n"}, porque la liquidación no acepta empates.` : ""}
      </p>
    </div>
  );
}
