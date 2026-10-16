import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clockLabel, homePredictSection } from "@/lib/matchAgenda";
import type { BaseballMatch } from "@/services/matchesApi";

function mark(name: string) {
  const skip = new Set(["de", "del", "la", "las", "los", "el"]);
  const word = name.split(/\s+/).find((part) => part && !skip.has(part.toLowerCase())) ?? name;
  return word.slice(0, 3).toUpperCase();
}

export function HomeAgenda({ matches, now, onPredict }: {
  matches: BaseballMatch[];
  now: number;
  onPredict: (match: BaseballMatch) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const section = homePredictSection(matches, now, expanded);

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#C6FF3D]">{section.title}</h2>
      {section.matches.length === 0 ? (
        <p className="rounded-[18px] px-4 py-4 text-[15px] font-extrabold leading-relaxed" style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}>
          Por ahora no hay juegos para pronosticar.{section.nextLabel ? ` El próximo es el ${section.nextLabel}.` : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {section.matches.map((match) => {
            const saved = match.prediction;
            return (
              <li key={match.id} className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-extrabold">{mark(match.awayTeam)} {match.awayTeam}</p>
                  <p className="truncate text-[14px] font-extrabold">{mark(match.homeTeam)} {match.homeTeam}</p>
                  <p className="text-[12px] font-bold text-[#C9D0D6]">{clockLabel(match.startsAt)}{saved ? ` · ✓ ${saved.awayScore} – ${saved.homeScore}` : ""}</p>
                </div>
                <button type="button" onClick={() => onPredict(match)} className="h-11 shrink-0 rounded-full bg-[#C6FF3D] px-3 text-[13px] font-extrabold text-[#0B0D0F]">
                  {saved ? "Editar" : "Pronosticar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {section.expandable ? (
        <button type="button" onClick={() => setExpanded(true)} className="mt-3 flex h-11 w-full items-center justify-center rounded-2xl text-[14px] font-extrabold text-[#C6FF3D]" style={{ border: "1px solid #2A2F33" }}>
          Ver más pronósticos
        </button>
      ) : null}
      {expanded && section.overflow ? (
        <button type="button" onClick={() => navigate("/tobo/mi-quiniela")} className="mt-2 flex h-11 w-full items-center justify-center text-[14px] font-extrabold text-[#C6FF3D]">
          Ver todos en Pronósticos →
        </button>
      ) : null}
    </section>
  );
}
