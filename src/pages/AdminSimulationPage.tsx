import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { SimulationStage, type SimulationVenue } from "@/components/simulation/SimulationStage";
import { listScenarios } from "@/services/simulationApi";
import { adminSimulationPreview, logSimulationEvent } from "@/services/simulationApi";
import { listMatches, listTascas, type BaseballMatch } from "@/services/matchesApi";
import { rememberAdminKey, storedAdminKey } from "@/lib/adminKey";
import type { ScenarioSummary } from "@/lib/simulation/types";
import { usePulse } from "@/state/PulseContext";

/**
 * Demo Control de la experiencia.
 *
 * Es una herramienta de administracion: reproduce el guion en el telefono sin
 * tocar la sesion del jugador, sin puntos y sin escribir el resultado oficial.
 * Un usuario normal no llega aqui (ruta fuera del TabBar + clave de admin).
 */
export function AdminSimulationPage() {
  const navigate = useNavigate();
  const { currentUser } = usePulse();
  const [adminKey, setAdminKey] = useState(() => storedAdminKey(currentUser?.accessCode ?? ""));
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selected, setSelected] = useState("cerrado");
  const [inning, setInning] = useState(1);
  const [match, setMatch] = useState<BaseballMatch | null>(null);
  const [venue, setVenue] = useState<SimulationVenue | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = adminKey.trim() || storedAdminKey(currentUser?.accessCode ?? "");
    if (key && key !== adminKey) setAdminKey(key);
    if (key) rememberAdminKey(key);
  }, [adminKey, currentUser?.accessCode]);

  useEffect(() => {
    let alive = true;
    listScenarios()
      .then((rows) => {
        if (!alive) return;
        setScenarios(rows);
        if (rows.length && !rows.some((row) => row.id === selected)) setSelected(rows[0].id);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selected]);

  // El partido y la tasca vienen de las entidades reales, nunca estan hardcodeados.
  useEffect(() => {
    let alive = true;
    Promise.all([listMatches(), listTascas()])
      .then(([matches, tascas]) => {
        if (!alive) return;
        setMatch(
          matches.find((row) => row.demo) ?? matches[0] ?? null,
        );
        const prize = tascas.find((row) => row.roundPrize) ?? tascas[0] ?? null;
        setVenue(
          prize
            ? {
                name: prize.name,
                prize: prize.roundPrize,
                detail: prize.prizeDetail ?? "",
                logoUrl: prize.logoUrl,
                slug: prize.slug,
              }
            : null,
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const scenario = useMemo(
    () => scenarios.find((row) => row.id === selected) ?? scenarios[0] ?? null,
    [scenarios, selected],
  );

  // El guion se pide al servidor con la clave, para no exponerlo sin permiso.
  useEffect(() => {
    if (!adminKey.trim() || !scenario) {
      setReady(false);
      return;
    }
    let alive = true;
    setPending(true);
    adminSimulationPreview(adminKey.trim(), scenario.id)
      .then(() => {
        if (alive) setReady(true);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setReady(false);
        setError(reason instanceof Error ? reason.message : "Clave de admin invalida.");
      })
      .finally(() => {
        if (alive) setPending(false);
      });
    return () => {
      alive = false;
    };
  }, [adminKey, scenario]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/admin/partidos")} />
        <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
          Simulacion
        </p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Demo Control</h2>
        <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
          Reproduce la experiencia antes de la reunion. No toca puntos, premios ni el resultado oficial.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <label className="block rounded-[24px] bg-white px-4 py-4">
          <span className="text-[13px] font-extrabold">Clave de admin</span>
          <input
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none"
            autoComplete="off"
          />
        </label>

        {error && <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        <div className="mt-3 rounded-[24px] bg-white px-4 py-4">
          <p className="text-[13px] font-extrabold">Escenario</p>
          <div className="mt-2 flex flex-col gap-2">
            {scenarios.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected(row.id)}
                className={`rounded-2xl px-3 py-3 text-left ${
                  selected === row.id ? "bg-[#241710] text-white" : "bg-[#FFF1EA] text-[#241710]"
                }`}
              >
                <span className="block text-[14px] font-extrabold">{row.name}</span>
                <span className="mt-0.5 block text-[12px] font-semibold opacity-70">
                  {row.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {match && (
          <div className="mt-3 rounded-[24px] bg-white px-4 py-4">
            <p className="text-[13px] font-extrabold">Partido</p>
            <p className="mt-1 text-[15px] font-extrabold">
              {match.awayTeam} vs {match.homeTeam}
            </p>
            <p className="text-[12px] font-semibold text-[#8D7366]">
              {venue ? `Premio de la experiencia: ${venue.name}` : "Sin tasca activa"}
            </p>
          </div>
        )}

        {pending && <p className="mt-3 text-[13px] font-bold text-[#8D7366]">Verificando clave…</p>}

        {ready && scenario && (
          <div className="mt-4">
            <div className="rounded-[24px] bg-white px-4 py-4">
              <p className="text-[13px] font-extrabold">Inning de entrada</p>
              <p className="mt-1 text-[12px] font-semibold text-[#8D7366]">
                Al reproducir, la experiencia abre directamente en este inning con su marcador y su contexto.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({ length: scenario.innings }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setInning(value)}
                    className={`h-10 w-10 rounded-xl text-[13px] font-extrabold ${
                      inning === value ? "bg-[#FF4F1A] text-white" : "bg-[#FFF1EA] text-[#241710]"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <PrimaryButton
                onClick={() => {
                  setError("");
                  void logSimulationEvent("", "simulation_demo_started", `demo:${scenario.id}:${inning}`);
                }}
                disabled={!match}
              >
                {match ? "Abrir experiencia" : "Sin partido disponible"}
              </PrimaryButton>
            </div>

            <div className="mt-4">
              <SimulationStage
                key={`${scenario.id}-${inning}`}
                script={scenario.script}
                awayTeam={match?.awayTeam ?? "Caracas"}
                homeTeam={match?.homeTeam ?? "Magallanes"}
                venue={venue}
                demo
                startInning={inning}
                  onVenue={() => venue?.slug && navigate(`/tobo/venue/${venue.slug}`)}
                onTelemetry={(type, dedupe) => {
                  void logSimulationEvent("", type, `demo:${dedupe}`);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
