import { useLayoutEffect, useRef, useState } from "react";
import { formatGamesBehind, formatWinPct, type StandingRow } from "@/lib/lvbpStandings";

function mark(id: string) {
  return `/avatars/${id}.webp`;
}

export function StandingsTable({ rows }: { rows: StandingRow[]; excludedTies?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const nodes = useRef(new Map<string, HTMLTableRowElement>());
  const previous = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    nodes.current.forEach((node, id) => {
      const top = node.getBoundingClientRect().top;
      const before = previous.current.get(id);
      if (!reduce && before !== undefined && before !== top) {
        node.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }],
          { duration: 180, easing: "ease" },
        );
      }
      next.set(id, top);
    });
    previous.current = next;
  }, [rows]);

  return (
    <section className="asi-van overflow-hidden rounded-[18px] border border-[#2A2F33] bg-[#090B0D] text-[#F4F6FA]">
      <header className="relative overflow-hidden px-4 pb-3 pt-4">
        <div className="pointer-events-none absolute -left-8 -top-6 h-16 w-16 rotate-12 bg-[#C6FF3D]" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-14 w-20 -rotate-12 bg-[#C6FF3D]" />
        <div className="relative flex items-center gap-2">
          <img src="/rusher-mark.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#C6FF3D]">Rusher</p>
        </div>
        <h2 className="relative mt-2 text-[34px] font-extrabold italic leading-none tracking-tight">
          <span className="text-white">ASÍ </span>
          <span className="text-[#C6FF3D]">VAN</span>
        </h2>
        <p className="relative mt-2 flex items-center gap-2 text-[10px] font-extrabold tracking-[0.16em] text-[#C6FF3D]">
          <span className="h-px flex-1 bg-[#C6FF3D]" />
          TEMPORADA 2026 · 2027
          <span className="h-px flex-1 bg-[#C6FF3D]" />
        </p>
      </header>
      <div className="px-2 pb-2">
        <table className="w-full table-fixed text-center text-[12px]">
          <caption className="sr-only">Así van los equipos de la LVBP</caption>
          <thead className="text-[10px] uppercase tracking-wide text-[#8B93A5]">
            <tr>
              <th className="w-[38%] py-2 text-left font-extrabold">Equipo</th>
              <th className="py-2 font-extrabold">Racha</th>
              <th className="py-2 font-extrabold">Últ 10</th>
              <th className="py-2 font-extrabold">Casa</th>
              <th className="py-2 font-extrabold">Ruta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const leader = row.rank === 1 && row.played > 0;
              return (
                <tr
                  key={row.id}
                  ref={(node) => {
                    if (node) nodes.current.set(row.id, node);
                    else nodes.current.delete(row.id);
                  }}
                  className={`border-t border-[#2A2F33] ${leader ? "bg-[#C6FF3D] text-[#0B0D0F]" : ""}`}
                >
                  <td className="py-1.5 text-left">
                    <button type="button" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)} className="flex min-h-[44px] w-full items-center gap-2 text-left">
                      <img src={mark(row.id)} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-extrabold">{row.team}</span>
                        <span className={`block text-[10px] font-bold ${leader ? "text-[#0B0D0F]" : "text-[#8B93A5]"}`}>{open === row.id ? "Ocultar" : "Ver detalle"}</span>
                      </span>
                    </button>
                  </td>
                  <td className="font-extrabold tabular-nums">{row.streak}</td>
                  <td className="font-extrabold tabular-nums">{row.last10}</td>
                  <td className="font-extrabold tabular-nums">{row.home}</td>
                  <td className="font-extrabold tabular-nums">{row.away}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.map((row) => open === row.id ? (
          <div key={`${row.id}-detail`} className="mx-1 mb-2 rounded-[12px] bg-[#12161A] px-3 py-3 text-[12px] font-bold text-[#F4F6FA]">
            <p>{row.team} · puesto {row.rank}</p>
            <p className="mt-1 text-[#8B93A5]">JJ {row.played} · G {row.wins} · P {row.losses} · PCT {formatWinPct(row.winPct)} · DIF {formatGamesBehind(row.gamesBehind)} · carreras {row.runDiff > 0 ? `+${row.runDiff}` : row.runDiff}</p>
          </div>
        ) : null)}
      </div>
      <p className="px-4 pb-4 text-center text-[11px] font-extrabold tracking-[0.14em] text-[#8B93A5]">El béisbol nos une</p>
    </section>
  );
}
