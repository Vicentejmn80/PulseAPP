import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { AdminMechanics } from "@/components/tobo/AdminMechanics";
import { featureLive, setInningKind, unfeatureLive } from "@/services/liveApi";
import { cancelMatch, closeRound, createMatch, listMatches, postponeMatch, redeemPrize, saveTasca, setMatchResult, type BaseballMatch } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";

const KEY = "pulse-admin-key";

function toCaracasTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00-04:00` : value;
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function defaultStart() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(19, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminMatchesPage() {
  const navigate = useNavigate();
  const { reload } = usePulse();
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY) ?? "");
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function refresh() {
    setMatches(await listMatches());
  }

  useEffect(() => {
    refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron cargar los partidos."));
  }, []);

  function rememberKey(value: string) {
    setAdminKey(value);
    sessionStorage.setItem(KEY, value);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    try {
      await createMatch({
        adminKey: adminKey.trim(),
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        startsAt: toCaracasTimestamp(startsAt),
      });
      setNotice("Partido creado.");
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear el partido.");
    } finally {
      setPending(false);
    }
  }

  async function onResult(match: BaseballMatch, homeScore: number, awayScore: number) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await setMatchResult({
        adminKey: adminKey.trim(),
        matchId: match.id,
        homeScore,
        awayScore,
      });
      setNotice(
        result.scored
          ? `Resultado guardado. ${result.scored} predicciones, ${result.points ?? 0} puntos repartidos.`
          : "Ese resultado ya estaba procesado. No se duplicaron puntos.",
      );
      await refresh();
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el resultado.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/partidos")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Admin</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Partidos</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <label className="block rounded-[24px] bg-white px-4 py-4">
          <span className="text-[13px] font-extrabold">Clave de admin</span>
          <input
            value={adminKey}
            onChange={(event) => rememberKey(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none"
            autoComplete="off"
          />
        </label>

        <form onSubmit={onCreate} className="mt-3 rounded-[24px] bg-white px-4 py-4">
          <p className="text-[16px] font-extrabold">Crear partido</p>
          <input value={homeTeam} onChange={(event) => setHomeTeam(event.target.value)} aria-label="Equipo local" placeholder="Equipo local" className="mt-3 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
          <input value={awayTeam} onChange={(event) => setAwayTeam(event.target.value)} aria-label="Equipo visitante" placeholder="Equipo visitante" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} aria-label="Fecha y hora" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
          <div className="mt-3">
            <PrimaryButton type="submit" disabled={pending}>Crear partido</PrimaryButton>
          </div>
        </form>

        <div className="mt-4 flex gap-4">
          <button type="button" onClick={() => navigate("/admin/tascas")} className="text-[13px] font-extrabold text-[#FF4F1A]">
            Tascas
          </button>
          <button type="button" onClick={() => navigate("/admin/simulador")} className="text-[13px] font-extrabold text-[#FF4F1A]">
            Simulador de partido
          </button>
        </div>
        <div className="mt-3 rounded-[24px] bg-white px-4 py-4">
          <p className="text-[14px] font-extrabold">Pregunta de cada inning</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <button type="button" onClick={() => void setInningKind(adminKey.trim(), "runs").then(() => setNotice("Cada inning pregunta si anotan.")).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo guardar."))} className="h-11 rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#FF4F1A]">¿Anotan carreras?</button>
            <button type="button" onClick={() => void setInningKind(adminKey.trim(), "count").then(() => setNotice("Cada inning pregunta cuántas carreras.")).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo guardar."))} className="h-11 rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#FF4F1A]">¿Cuántas carreras?</button>
            <button type="button" onClick={() => void setInningKind(adminKey.trim(), "first").then(() => setNotice("Cada inning pregunta quién anota primero.")).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo guardar."))} className="h-11 rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#FF4F1A]">¿Quién anota primero?</button>
          </div>
        </div>
        <PilotTools adminKey={adminKey} disabled={pending} onDone={setNotice} onFail={setError} />
        <AdminMechanics adminKey={adminKey} matches={matches} onDone={setNotice} onFail={setError} />

        {notice && <p className="mt-3 rounded-2xl bg-[#241710] px-4 py-3 text-[13px] font-bold text-white">{notice}</p>}
        {error && <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          {matches.filter((match) => !match.simulation).map((match) => (
            <ResultCard key={`${match.id}-${match.status}-${match.startsAt}`} match={match} disabled={pending} adminKey={adminKey} onDone={async (message) => { setNotice(message); await refresh(); }} onFail={setError} onSave={onResult} onPostpone={async (starts) => {
              setPending(true);
              setError("");
              try {
                await postponeMatch({ adminKey: adminKey.trim(), matchId: match.id, startsAt: toCaracasTimestamp(starts) });
                setNotice("Juego pospuesto. El pronóstico sigue editable hasta la nueva hora.");
                await refresh();
              } catch (reason: unknown) {
                setError(reason instanceof Error ? reason.message : "No se pudo posponer.");
              } finally {
                setPending(false);
              }
            }} onCancel={async () => {
              setPending(true);
              setError("");
              try {
                await cancelMatch({ adminKey: adminKey.trim(), matchId: match.id });
                setNotice("Juego cancelado. No otorga puntos.");
                await refresh();
              } catch (reason: unknown) {
                setError(reason instanceof Error ? reason.message : "No se pudo cancelar.");
              } finally {
                setPending(false);
              }
            }} onOpenReporter={() => navigate(`/reportar/${match.id}`)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PilotTools({
  adminKey,
  disabled,
  onDone,
  onFail,
}: {
  adminKey: string;
  disabled: boolean;
  onDone: (message: string) => void;
  onFail: (message: string) => void;
}) {
  const [tasca, setTasca] = useState("");
  const [zone, setZone] = useState("");
  const [code, setCode] = useState("");

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (reason: unknown) {
      onFail(reason instanceof Error ? reason.message : "No se pudo completar.");
    }
  }

  return (
    <div className="mt-3 rounded-[24px] bg-white px-4 py-4">
      <p className="text-[16px] font-extrabold">Rondas y tascas</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["ronda_1", "ronda_2", "ronda_3"] as const).map((id, index) => (
          <button key={id} type="button" disabled={disabled} onClick={() => void run(async () => {
            const result = await closeRound({ adminKey: adminKey.trim(), cycleId: id });
            onDone(result.already ? "Esa ronda ya tenía ganadores." : `Ronda ${index + 1} cerrada. ${result.awarded ?? 0} tobos.`);
          })} className="h-11 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A] disabled:opacity-40">
            Cerrar {index + 1}
          </button>
        ))}
      </div>
      <input value={tasca} onChange={(event) => setTasca(event.target.value)} placeholder="Nombre de la tasca" className="mt-3 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
      <input value={zone} onChange={(event) => setZone(event.target.value)} placeholder="Zona" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
      <button type="button" disabled={disabled} onClick={() => void run(async () => {
        await saveTasca({ adminKey: adminKey.trim(), name: tasca, zone, address: zone, contact: "", founder: true });
        setTasca("");
        onDone("Tasca publicada.");
      })} className="mt-2 h-11 w-full rounded-2xl bg-[#241710] text-[13px] font-extrabold text-white disabled:opacity-40">
        Publicar tasca fundadora
      </button>
      <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Código de canje" className="mt-3 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
      <button type="button" disabled={disabled} onClick={() => void run(async () => {
        const result = await redeemPrize({ adminKey: adminKey.trim(), code });
        onDone(result.already ? "Ese tobo ya estaba canjeado." : "Canje registrado.");
      })} className="mt-2 h-11 w-full rounded-2xl bg-[#241710] text-[13px] font-extrabold text-white disabled:opacity-40">
        Registrar canje
      </button>
    </div>
  );
}

function ResultCard({
  match,
  disabled,
  adminKey,
  onDone,
  onFail,
  onSave,
  onPostpone,
  onCancel,
  onOpenReporter,
}: {
  match: BaseballMatch;
  disabled: boolean;
  adminKey: string;
  onDone: (message: string) => void;
  onFail: (message: string) => void;
  onSave: (match: BaseballMatch, homeScore: number, awayScore: number) => Promise<void>;
  onPostpone: (startsAt: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onOpenReporter: () => void;
}) {
  const [home, setHome] = useState(match.homeScore === null ? "" : String(match.homeScore));
  const [away, setAway] = useState(match.awayScore === null ? "" : String(match.awayScore));
  const [whenAt, setWhenAt] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d+$/.test(home.trim()) || !/^\d+$/.test(away.trim())) return;
    void onSave(match, Number(home), Number(away));
  }

  return (
    <form onSubmit={submit} className="rounded-[24px] bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-extrabold">
          {match.awayTeam} en {match.homeTeam}
        </p>
        <span className="text-[12px] font-extrabold uppercase text-[#A08B80]">
          {{ scheduled: "Disponible", locked: "Cerrado", in_progress: "En vivo", finished: "Finalizado", postponed: "Pospuesto", cancelled: "Cancelado" }[match.status]}
        </span>
      </div>
      <p className="mt-1 text-[12px] font-semibold text-[#8D7366]">{when(match.startsAt)}</p>
      {match.status !== "finished" && match.status !== "cancelled" && !match.featured && (
        <button type="button" onClick={() => void featureLive(adminKey.trim(), match.id).then(() => onDone("Juego estelar en vivo.")).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo abrir."))} className="mt-3 h-11 w-full rounded-2xl bg-[#241710] text-[13px] font-extrabold text-white">
          Hacer juego estelar
        </button>
      )}
      {match.featured && match.status === "in_progress" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpenReporter} className="h-11 rounded-2xl bg-[#FF4F1A] text-[13px] font-extrabold text-white">Reportar</button>
          <button type="button" onClick={() => void unfeatureLive(adminKey.trim(), match.id).then(() => onDone("Estelar apagado.")).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo quitar."))} className="h-11 rounded-2xl bg-[#FFF1EA] text-[13px] font-extrabold text-[#E23B2F]">Quitar estelar</button>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input inputMode="numeric" value={home} onChange={(event) => setHome(event.target.value)} aria-label={`Resultado ${match.homeTeam}`} className="h-12 w-full rounded-2xl bg-[#FFF7F1] text-center text-[18px] font-extrabold outline-none" />
        <span className="font-extrabold text-[#A08B80]">-</span>
        <input inputMode="numeric" value={away} onChange={(event) => setAway(event.target.value)} aria-label={`Resultado ${match.awayTeam}`} className="h-12 w-full rounded-2xl bg-[#FFF7F1] text-center text-[18px] font-extrabold outline-none" />
      </div>
      <p className="mt-2 text-[11px] font-bold text-[#A08B80]">Primero el local, después el visitante.</p>
      <button type="submit" disabled={disabled} className="mt-3 h-12 w-full rounded-2xl bg-[#241710] text-[14px] font-extrabold text-white disabled:opacity-40">
        Guardar resultado
      </button>
      {match.status !== "finished" && match.status !== "cancelled" && (
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <input type="datetime-local" value={whenAt} onChange={(event) => setWhenAt(event.target.value)} aria-label="Nueva hora" className="h-11 rounded-2xl bg-[#FFF7F1] px-2 text-[12px] font-bold outline-none" />
          <button type="button" disabled={disabled || !whenAt} onClick={() => void onPostpone(whenAt)} className="h-11 rounded-2xl bg-[#FFF1EA] px-3 text-[12px] font-extrabold text-[#FF4F1A] disabled:opacity-40">Posponer</button>
        </div>
      )}
      {match.status !== "finished" && match.status !== "cancelled" && (
        <button type="button" disabled={disabled} onClick={() => void onCancel()} className="mt-2 h-10 w-full text-[12px] font-extrabold text-[#E23B2F] disabled:opacity-40">
          Cancelar sin puntos
        </button>
      )}
    </form>
  );
}
