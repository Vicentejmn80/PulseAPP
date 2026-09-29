import { useEffect, useRef, useState } from "react";
import { answerLive } from "@/services/mechanicsApi";
import { challengeAlias, matchCenter, type BingoPick, type CrowdShare, type LiveEvent, type MatchCenter } from "@/services/liveApi";
import { Countdown } from "@/components/tobo/PilotExtras";

const LABELS: Record<string, string> = {
  jonron: "Jonrón",
  ponche: "Ponche",
  doble_play: "Doble play",
  base_robada: "Base robada",
  error: "Error",
  hit: "Hit",
  carrera: "Carrera",
  cambio_pitcher: "Cambio de pitcher",
  out: "Out",
  otro: "Jugada",
  bases_llenas: "Bases llenas",
  triple: "Triple",
  sacrificio: "Sacrificio",
};

function ordinal(inning: number) {
  const names: Record<number, string> = { 1: "1ra", 2: "2da", 3: "3ra", 4: "4ta", 5: "5ta", 6: "6ta", 7: "7ma", 8: "8va", 9: "9na" };
  return names[inning] ?? `${inning}.a`;
}

export function halfLabel(half: string, inning: number) {
  return `${half === "baja" ? "Baja" : "Alta"} ${ordinal(inning)}`;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    // El sonido es opcional.
  }
}

export function ShareLine({ share, empty }: { share: CrowdShare | null; empty: string }) {
  if (!share) return null;
  if (share.hidden) return <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Cuando haya más gente, vas a ver cómo se reparte.</p>;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {(share.options ?? []).map((option) => {
        const label = option.team || option.label || empty;
        return (
          <div key={label}>
            <div className="flex items-center justify-between text-[13px] font-extrabold">
              <span>{label}</span>
              <span>{option.percent}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#FFF1EA]">
              <div className="h-full rounded-full bg-[#FF4F1A]" style={{ width: `${option.percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DuelBox({ matchId, duels, onDone }: { matchId: string; duels: MatchCenter["duels"]; onDone: () => void }) {
  const [alias, setAlias] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setError("");
    setNote("");
    try {
      const result = await challengeAlias(matchId, alias);
      setAlias("");
      setNote(result.pending ? `Reto enviado a ${result.alias}. Falta el pronóstico.` : `Reto listo con ${result.alias}.`);
      onDone();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo retar.");
    }
  }

  return (
    <section className="rounded-[24px] bg-white px-4 py-4">
      <h3 className="text-[16px] font-extrabold">Retar a un amigo</h3>
      <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Comparan los puntos de este juego. No mueve el ranking ni el tobo.</p>
      <div className="mt-3 flex gap-2">
        <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Alias" aria-label="Alias del amigo" className="h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
        <button type="button" onClick={() => void send()} className="h-12 shrink-0 rounded-2xl bg-[#241710] px-4 text-[13px] font-extrabold text-white">Retar</button>
      </div>
      {note && <p className="mt-2 text-[13px] font-extrabold text-[#FF4F1A]">{note}</p>}
      {error && <p className="mt-2 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
      {duels.map((duel) => (
        <p key={duel.id} className="mt-3 text-[14px] font-extrabold">
          {duel.status === "resolved" && duel.tie && `Empate con ${duel.opponent}, ${duel.mine} a ${duel.theirs}.`}
          {duel.status === "resolved" && !duel.tie && duel.iWon && `Le ganaste a ${duel.opponent} ${duel.mine} a ${duel.theirs}.`}
          {duel.status === "resolved" && !duel.tie && !duel.iWon && `${duel.opponent} te ganó ${duel.theirs} a ${duel.mine}.`}
          {duel.status === "pending" && `Reto con ${duel.opponent}: falta un pronóstico.`}
          {duel.status === "ready" && `Reto con ${duel.opponent}: se define al final.`}
          {duel.status === "void" && `El reto con ${duel.opponent} no se pudo definir.`}
        </p>
      ))}
    </section>
  );
}

function EventRow({ event, fresh }: { event: LiveEvent; fresh: boolean }) {
  return (
    <article className={`rounded-2xl bg-white px-4 py-3 ${fresh ? "live-event-in" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#FF4F1A]">{halfLabel(event.half, event.inning)}</p>
        <p className="text-[12px] font-extrabold text-[#A08B80]">{LABELS[event.type] ?? event.type}</p>
      </div>
      <p className="mt-1 text-[15px] font-extrabold">{event.description || LABELS[event.type] || "Jugada"}</p>
      <p className="mt-1 text-[13px] font-bold text-[#8D7366]">{event.awayScore} — {event.homeScore}</p>
    </article>
  );
}

function BingoCells({ picks, freshIds }: { picks: BingoPick[]; freshIds: string[] }) {
  if (picks.length === 0) return null;
  return (
    <section className="rounded-[24px] bg-white px-4 py-4">
      <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Tu bingo</p>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {picks.map((pick) => {
          const on = Boolean(pick.resolvedAt);
          return (
            <div key={pick.id} className={`rounded-2xl px-3 py-3 text-[14px] font-extrabold ${on ? "bg-[#FF4F1A] text-white" : "bg-[#FFF7F1]"} ${freshIds.includes(pick.id) ? "bingo-pop" : ""}`}>
              {pick.label}{on ? " · salió" : ""}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LiveCenter({ matchId }: { matchId: string }) {
  const [center, setCenter] = useState<MatchCenter | null>(null);
  const [error, setError] = useState("");
  const seen = useRef(new Set<string>());
  const seenHits = useRef(new Set<string>());
  const primed = useRef(false);
  const [freshEvent, setFreshEvent] = useState("");
  const [freshHits, setFreshHits] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const next = await matchCenter(matchId);
        if (!alive) return;
        if (!next?.ok || !next.match) throw new Error(next?.error || "No se pudo actualizar el juego.");
        const newest = next.events?.[0];
        if (newest && primed.current && !seen.current.has(newest.id)) setFreshEvent(newest.id);
        next.events?.forEach((event) => seen.current.add(event.id));
        const just: string[] = [];
        next.bingo?.picks?.forEach((pick) => {
          if (pick.resolvedAt && primed.current && !seenHits.current.has(pick.id)) just.push(pick.id);
          if (pick.resolvedAt) seenHits.current.add(pick.id);
        });
        primed.current = true;
        if (just.length) {
          setFreshHits(just);
          beep();
        }
        setCenter(next);
        setError("");
      } catch (reason: unknown) {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo actualizar el juego.");
      }
    }
    void load();
    const id = setInterval(() => void load(), 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [matchId, tick]);

  if (!center?.match) {
    return <p className="rounded-[28px] bg-white px-5 py-8 text-center text-[15px] font-extrabold">{error || "Cargando el juego…"}</p>;
  }

  const { match, prediction, closeness, events, bingo, live } = center;
  const width = closeness ? Math.max(8, Math.round((closeness.closenessPoints / 40) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[28px] bg-gradient-to-br from-[#FF8A3C] via-[#FF4F1A] to-[#E8360C] px-5 py-5 text-white">
        {match.simulation && <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]">Simulación</p>}
        <p className="mt-1 text-[13px] font-extrabold uppercase tracking-[0.14em] text-white/80">{halfLabel(match.half, match.inning)}</p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <p className="text-[40px] font-extrabold leading-none tabular-nums">{match.awayScore ?? 0}</p>
            <p className="mt-1 text-[13px] font-bold text-white/80">{match.awayTeam}</p>
          </div>
          <p className="pb-5 text-[14px] font-extrabold text-white/70">vs</p>
          <div className="text-right">
            <p className="text-[40px] font-extrabold leading-none tabular-nums">{match.homeScore ?? 0}</p>
            <p className="mt-1 text-[13px] font-bold text-white/80">{match.homeTeam}</p>
          </div>
        </div>
      </section>

      {prediction && closeness && (
        <section className="rounded-[24px] bg-white px-4 py-4">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Tu pronóstico</p>
          <p className="mt-1 text-[16px] font-extrabold">{prediction.awayScore} — {prediction.homeScore}</p>
          <p className="mt-2 text-[15px] font-extrabold text-[#FF4F1A]">{closeness.mood === "cerca" ? "Vas cerca" : "Te alejaste"}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#FFF1EA]">
            <div className="h-full rounded-full bg-[#FF4F1A]" style={{ width: `${width}%` }} />
          </div>
        </section>
      )}

      {live.filter((question) => question.status === "open" || question.myOption).map((question) => (
        <LivePrompt key={question.id} question={question} onDone={() => setTick((value) => value + 1)} />
      ))}

      <BingoCells picks={bingo?.picks ?? []} freshIds={freshHits} />
      {bingo?.points > 0 && <p className="px-1 text-[14px] font-extrabold text-[#FF4F1A]">Bingo +{bingo.points} pts</p>}

      <div className="flex flex-col gap-2">
        {(events ?? []).map((event) => <EventRow key={event.id} event={event} fresh={event.id === freshEvent} />)}
        {events?.length === 0 && <p className="rounded-[24px] bg-white px-4 py-6 text-center text-[14px] font-extrabold">La primera jugada aparece aquí.</p>}
      </div>

      <DuelBox matchId={matchId} duels={center.duels ?? []} onDone={() => setTick((value) => value + 1)} />
      {error && <p className="text-[13px] font-bold text-[#E23B2F]">{error}</p>}
    </div>
  );
}

function LivePrompt({ question, onDone }: { question: MatchCenter["live"][number]; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const resolved = question.status === "resolved" || question.status === "void";
  const mine = question.options.find((option) => option.id === question.myOption);

  async function choose(optionId: string) {
    setPending(true);
    setError("");
    try {
      await answerLive(question.id, optionId);
      onDone();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo responder.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[24px] border-2 border-[#FF4F1A] bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#E23B2F]">Pregunta en vivo</p>
        {question.status === "open" && <p className="text-[13px] font-extrabold"><Countdown until={question.closesAt} /></p>}
      </div>
      <h3 className="mt-2 text-[18px] font-extrabold leading-tight">{question.prompt}</h3>
      {question.status === "open" && !question.myOption && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {question.options.map((option) => (
            <button key={option.id} type="button" disabled={pending} onClick={() => void choose(option.id)} className="min-h-12 rounded-2xl bg-[#FFF1EA] px-2 text-[14px] font-extrabold disabled:opacity-40">
              {option.label}
            </button>
          ))}
        </div>
      )}
      {question.myOption && !resolved && <p className="mt-3 text-[14px] font-extrabold">Respuesta guardada: {mine?.label}</p>}
      {resolved && (
        <p className="mt-3 text-[15px] font-extrabold text-[#FF4F1A]">
          {question.myOption && question.myOption === question.correctOption ? `Acertaste · +${question.points ?? question.livePoints} pts` : "Esta vez no sumó"}
        </p>
      )}
      {question.myOption && <ShareLine share={question.share} empty="Respuesta" />}
      {error && <p className="mt-2 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
    </section>
  );
}
