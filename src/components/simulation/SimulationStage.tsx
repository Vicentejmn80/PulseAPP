import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clockAt, frameAt, seekToInning, seekToMoment, summarize } from "@/lib/simulation/engine";
import { useSimulationClock } from "@/lib/simulation/clock";
import type {
  SimulationFrame,
  SimulationScript,
  SimulationSpeed,
} from "@/lib/simulation/types";
import { SPEEDS } from "@/lib/simulation/types";
import { SoundCue, createSoundboard } from "@/lib/simulation/sound";

export interface SimulationVenue {
  name: string;
  prize: string;
  detail: string;
  logoUrl?: string;
  slug?: string;
}

export interface SimulationStageProps {
  script: SimulationScript;
  awayTeam: string;
  homeTeam: string;
  venue?: SimulationVenue | null;
  /**_demo: el panel de control y la reloj los maneja el administrador. */
  demo?: boolean;
  startInning?: number;
  /** Reproduce el estado final sin interacción. Para la pantalla de resumen. */
  finished?: boolean;
  /** Respuestas ya guardadas, para hidratar el resumen. */
  initialAnswers?: Record<string, string>;
  /** Aciertos ya liquidados por el servidor. Manda sobre el cálculo local. */
  correctOverride?: number;
  /** Bonus ya acreditado por el servidor. Es la cifra real de la cuenta. */
  creditedBonus?: number;
  onAnswer?: (momentId: string, optionId: string) => void | Promise<void>;
  onFinished?: (summary: ReturnType<typeof summarize>) => void;
  onTelemetry?: (type: string, dedupe: string) => void;
  onVenue?: () => void;
}

const REACTION_RING: Record<string, string> = {
  calm: "",
  cheer: "ring-cheer",
  tense: "ring-tense",
  turn: "ring-turn",
  climax: "ring-climax",
};

function ordinal(inning: number) {
  return `${inning}.º`;
}

function clockLabel(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function baseLabels(outs: number) {
  return [
    { on: (outs & 1) === 1, first: true, second: false, third: false },
    { on: (outs & 2) === 2, first: false, second: true, third: false },
    { on: (outs & 4) === 4, first: false, second: false, third: true },
  ];
}

export function SimulationStage({
  script,
  awayTeam,
  homeTeam,
  venue,
  demo = false,
  startInning = 1,
  finished = false,
  initialAnswers,
  correctOverride,
  creditedBonus,
  onAnswer,
  onFinished,
  onTelemetry,
  onVenue,
}: SimulationStageProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers ?? {});
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const sound = useMemo(() => createSoundboard(), []);
  const told = useRef(new Set<string>());
  // En el resumen el reloj arranca al final del partido, no en el primer inning.
  const clock = useSimulationClock(script, finished ? script.innings : startInning);

  const matchClock = useMemo(() => clockAt(script, clock.elapsed), [script, clock.elapsed]);

  // Un momento se revela cuando el jugador responde o cuando vence su plazo.
  // Se deriva del reloj y de las respuestas: no hay estado que pueda desincronizarse.
  const revealed = useMemo(() => {
    const flags: Record<string, boolean> = {};
    for (const moment of script.moments) {
      if (answers[moment.id]) {
        flags[moment.id] = true;
        continue;
      }
      if (matchClock.inning > moment.inning) {
        flags[moment.id] = true;
        continue;
      }
      if (
        matchClock.inning === moment.inning &&
        (matchClock.half !== moment.half || matchClock.into >= moment.resolveAt)
      ) {
        flags[moment.id] = true;
      }
    }
    return flags;
  }, [answers, matchClock, script.moments]);

  const frame: SimulationFrame = useMemo(
    () => frameAt(script, clock.elapsed, answers, dismissed, revealed),
    [script, clock.elapsed, answers, dismissed, revealed],
  );

  const summary = useMemo(() => summarize(script, answers), [script, answers]);
  // El servidor es la fuente de la cifra acreditada; lo local es solo_estimación.
  const correct = correctOverride ?? summary.correct;
  const awarded = creditedBonus ?? summary.momentBonus;

  // El ambiente del paquete se prepara una vez, no en cada jugada.
  useEffect(() => {
    if (!frame.moment) return;
    if (frame.moment.moment.inning === 9) sound.play(SoundCue.ultimate);
    else if (frame.moment.moment.inning === 7) sound.play(SoundCue.pulse);
  }, [frame.moment, sound]);

  useEffect(() => {
    if (!frame.event) return;
    if (frame.event.reaction === "climax") sound.play(SoundCue.homer);
    else if (frame.event.reaction === "cheer") sound.play(SoundCue.hit);
    else if (frame.event.reaction === "tense") sound.play(SoundCue.tension);
  }, [frame.event, sound]);

  // Analitica: mismo sistema, no uno paralelo.
  const tell = useCallback(
    (type: string, key: string) => {
      const dedupe = `${script.id}:${key}`;
      if (told.current.has(dedupe)) return;
      told.current.add(dedupe);
      onTelemetry?.(type, dedupe);
    },
    [onTelemetry, script.id],
  );

  useEffect(() => {
    if (clock.elapsed <= 0) return;
    tell("simulation_inning_started", `inning:${frame.clock.inning}`);
  }, [frame.clock.inning, clock.elapsed, tell]);

  useEffect(() => {
    if (frame.moment) tell("simulation_moment_started", `moment:${frame.moment.moment.id}`);
  }, [frame.moment, tell]);

  useEffect(() => {
    if (frame.clock.finished) onFinished?.(summary);
  }, [frame.clock.finished, onFinished, summary]);

  const choose = useCallback(
    async (momentId: string, optionId: string) => {
      if (pending) return;
      setPending(true);
      setAnswers((current) => ({ ...current, [momentId]: optionId }));
      tell("simulation_moment_answered", `answer:${momentId}`);
      sound.play(SoundCue.answer);
      try {
        await onAnswer?.(momentId, optionId);
      } finally {
        setPending(false);
      }
    },
    [onAnswer, pending, sound, tell],
  );

  const { inning, score, moment, resolution, event } = frame;
  const isFinal = frame.clock.inning === 9;
  const bases = baseLabels(frame.outs);

  return (
    <div className="flex flex-col gap-3">
      {isFinal && !frame.clock.finished && (
        <div className="sim-ultimate rounded-[24px] bg-[#241710] px-4 py-5 text-center text-white">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.3em] text-[#FF8A3C]">
            Ultimo inning
          </p>
          <p className="mt-1 text-[26px] font-extrabold leading-tight">
            {frame.outs} {frame.outs === 1 ? "out" : "outs"}
          </p>
        </div>
      )}

      {venue && !frame.clock.finished && (
        <div className="flex items-center gap-2.5 rounded-[20px] bg-white px-3 py-2.5">
          {venue.logoUrl ? (
            <img src={venue.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF1EA] text-[15px]">
              🍻
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#8D7366]">
            Presentada por <span className="font-extrabold text-[#241710]">{venue.name}</span>
          </p>
        </div>
      )}

      <section
        className={`rounded-[28px] bg-[#241710] px-5 py-5 text-white ${
          frame.event ? REACTION_RING[frame.event.reaction] : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#FF8A3C]">
            {isFinal ? "9.º inning" : `Inning ${ordinal(frame.clock.inning)}`}
          </p>
          <p className="text-[26px] font-extrabold tabular-nums">
            {clockLabel(frame.clock.remainingMs)}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[13px] font-bold text-white/60">{awayTeam}</p>
            <p className="text-[44px] font-extrabold leading-none tabular-nums">{score.away}</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold text-white/60">{homeTeam}</p>
            <p className="text-[44px] font-extrabold leading-none tabular-nums">{score.home}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`h-2 w-2 rounded-full ${index < frame.outs ? "bg-[#FF4F1A]" : "bg-white/20"}`}
            />
          ))}
          <span className="ml-2 flex gap-1">
            {bases.map((base, index) => (
              <span
                key={index}
                className={`h-2.5 w-2.5 rounded-[3px] ${base.on ? "bg-[#FF8A3C]" : "bg-white/20"}`}
              />
            ))}
          </span>
          <span className="ml-auto text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/40">
            {frame.clock.half === "baja" ? "Baja" : "Alta"}
          </span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#FF4F1A] transition-[width] duration-500"
            style={{ width: `${Math.round(frame.clock.progress * 100)}%` }}
          />
        </div>

        {inning && frame.clock.into < 3 && (
          <div className="sim-inning-in mt-4">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#FF8A3C]">
              {isFinal ? "Ultimo inning" : `Inning ${ordinal(inning.inning)}`}
            </p>
            <p className="text-[20px] font-extrabold leading-tight">{inning.title}</p>
            <p className="text-[13px] font-semibold text-white/60">{inning.subtitle}</p>
          </div>
        )}

        {event && frame.clock.into >= 3 && (
          <p key={`${event.inning}-${event.half}-${event.at}`} className="sim-event-in mt-4 min-h-12 text-[16px] font-extrabold leading-snug">
            {event.text}
          </p>
        )}
      </section>

      {moment && (
        <MomentCard
          headline={moment.moment.headline}
          title={moment.moment.title}
          lead={moment.moment.lead}
          state={moment.moment.state}
          score={moment.moment.score}
          prompt={moment.moment.prompt}
          options={moment.moment.options}
          answer={moment.answer}
          bonus={moment.moment.bonus}
              pending={pending}
              onChoose={(optionId) => void choose(moment.moment.id, optionId)}
          onSkip={() =>
            setDismissed((current) => ({ ...current, [moment.moment.id]: true }))
          }
        />
      )}

      {resolution && !moment && (
        <div
          className={`rounded-[24px] px-4 py-3 text-[15px] font-extrabold ${
            resolution.hit ? "bg-[#241710] text-white" : "bg-white text-[#8D7366]"
          }`}
        >
          {resolution.hit
            ? "Acertaste. Response guardada."
            : resolution.answer
              ? "No fue esta vez."
              : "Veamos que pasa..."}
        </div>
      )}

      {frame.clock.finished && (
        <ResultPanel
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          away={summary.finalAway}
          home={summary.finalHome}
          correct={correct}
          total={summary.total}
          awarded={awarded}
          venue={venue}
          onVenue={onVenue}
        />
      )}

      {demo && <DemoBar script={script} clock={clock} frame={frame} />}
    </div>
  );
}

function MomentCard({
  headline,
  title,
  lead,
  state,
  score,
  prompt,
  options,
  answer,
  bonus,
  pending,
  onChoose,
  onSkip,
}: {
  headline: string;
  title: string;
  lead: string;
  state: string;
  score: string;
  prompt: string;
  options: { id: string; label: string }[];
  answer: string | null;
  bonus: number;
  pending: boolean;
  onChoose: (optionId: string) => void;
  onSkip: () => void;
}) {
  return (
    <section className="sim-moment-in rounded-[24px] bg-white px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F1A]">
          {headline}
        </p>
        {bonus > 0 && (
          <span className="rounded-full bg-[#FFF1EA] px-2 py-0.5 text-[11px] font-extrabold text-[#FF4F1A]">
            +{bonus} PT
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#A08B80]">
        {title}
      </p>
      <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">{lead}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full bg-[#241710] px-2 py-1 text-[12px] font-extrabold tabular-nums text-white">
          {score}
        </span>
        <span className="text-[12px] font-bold text-[#8D7366]">{state}</span>
      </div>
      <p className="mt-3 text-[18px] font-extrabold leading-snug">{prompt}</p>
      <div className="mt-3 flex flex-col gap-2">
        {options.map((option) => {
          const chosen = answer === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={pending}
              onClick={() => onChoose(option.id)}
              className={`min-h-12 rounded-2xl px-3 text-[14px] font-extrabold transition-colors disabled:opacity-40 ${
                chosen
                  ? "bg-[#241710] text-white"
                  : "bg-[#FFF1EA] text-[#241710]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="mt-3 text-[13px] font-extrabold text-[#8D7366]"
      >
        Seguir el partido
      </button>
    </section>
  );
}

function ResultPanel({
  awayTeam,
  homeTeam,
  away,
  home,
  correct,
  total,
  awarded,
  venue,
  onVenue,
}: {
  awayTeam: string;
  homeTeam: string;
  away: number;
  home: number;
  correct: number;
  total: number;
  awarded: number;
  venue?: SimulationVenue | null;
  onVenue?: () => void;
}) {
  return (
    <section className="rounded-[28px] bg-white px-5 py-5">
      <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F1A]">
        Fin de la experiencia
      </p>
      <h3 className="mt-1 text-[26px] font-extrabold">Simulacion</h3>
      <p className="mt-3 text-[30px] font-extrabold tabular-nums">
        {awayTeam} {away}
      </p>
      <p className="text-[30px] font-extrabold tabular-nums">
        {homeTeam} {home}
      </p>
      <p className="mt-4 text-[16px] font-extrabold">
        Momentos acertados: {correct} / {total}
      </p>
      <p className="mt-3 text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">
        Puntos de esta experiencia
      </p>
      <p className="text-[30px] font-extrabold">+{awarded} PT</p>
      <p className="mt-3 text-[13px] font-semibold text-[#8D7366]">
        Este marcador es el resultado de la simulacion. No cambia el resultado oficial del partido.
      </p>
      {venue && (
        <div className="mt-4 rounded-2xl bg-[#FFF7F1] px-4 py-4">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">
            Premio de la experiencia
          </p>
          <p className="text-[17px] font-extrabold">{venue.name}</p>
          {venue.prize && <p className="text-[14px] font-bold text-[#8D7366]">{venue.prize}</p>}
          {onVenue && (
            <button
              type="button"
              onClick={onVenue}
              className="mt-3 text-[14px] font-extrabold text-[#FF4F1A]"
            >
              Ver tasca
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function DemoBar({
  script,
  clock,
  frame,
}: {
  script: SimulationScript;
  clock: ReturnType<typeof useSimulationClock>;
  frame: SimulationFrame;
}) {
  return (
    <div className="rounded-[20px] border-2 border-dashed border-[#FF4F1A] bg-white px-3 py-3">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
        Demo · {script.name} · {frame.clock.inning}.º {frame.clock.half}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <DemoButton onClick={clock.running ? clock.pause : clock.play}>
          {clock.running ? "Pausar" : "Reproducir"}
        </DemoButton>
        <DemoButton onClick={clock.restart}>Reiniciar</DemoButton>
        <DemoButton onClick={clock.prevInning}>Anterior</DemoButton>
        <DemoButton onClick={clock.nextInning}>Siguiente</DemoButton>
        {SPEEDS.map((value: SimulationSpeed) => (
          <DemoButton
            key={value}
            active={clock.speed === value}
            onClick={() => clock.setSpeed(value)}
          >
            {value}x
          </DemoButton>
        ))}
        {script.moments
          .filter((moment) => moment.inning === frame.clock.inning)
          .map((moment) => (
            <DemoButton key={moment.id} onClick={() => clock.seek(seekToMoment(script, moment.id) ?? 0)}>
              Momento
            </DemoButton>
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.from({ length: script.innings }, (_, index) => index + 1).map((inning) => (
          <DemoButton
            key={inning}
            active={frame.clock.inning === inning}
            onClick={() => clock.seek(seekToInning(script, inning))}
          >
            {inning}
          </DemoButton>
        ))}
      </div>
    </div>
  );
}

function DemoButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-xl px-2.5 text-[12px] font-extrabold ${
        active ? "bg-[#FF4F1A] text-white" : "bg-[#FFF1EA] text-[#241710]"
      }`}
    >
      {children}
    </button>
  );
}
