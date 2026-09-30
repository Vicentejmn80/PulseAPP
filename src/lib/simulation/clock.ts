import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clockAt, secondsPerInning, totalSeconds } from "@/lib/simulation/engine";
import type { SimulationScript, SimulationSpeed } from "@/lib/simulation/types";

/**
 * Reloj de la experiencia.
 *
 * Es deliberadamente del lado del cliente: el servidor nunca avanza el tiempo.
 * Asi una demo puede saltar al 7.o, pausar o ir a 4x sin tocar la partida real.
 * El reloj solo produce un numero: "segundos transcurridos".
 */

export interface SimulationClock {
  elapsed: number;
  running: boolean;
  speed: SimulationSpeed;
  duration: number;
}

/**
 * @param startInning inning por el que abre la experiencia (1..9).
 * @param atEnd cuando es true el reloj arranca en el final del partido.
 *   Lo usa la pantalla de resumen para mostrar el resultado real y no un 0-0.
 */
export function useSimulationClock(
  script: SimulationScript | null,
  startInning = 1,
  atEnd = false,
) {
  const duration = script ? totalSeconds(script) : 0;
  const opening = useMemo(() => {
    if (!script) return 0;
    if (atEnd) return duration;
    return (Math.min(script.innings, Math.max(1, startInning)) - 1) * secondsPerInning(script);
  }, [script, startInning, atEnd, duration]);

  const [elapsed, setElapsed] = useState(opening);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const last = useRef<number | null>(null);

  // Cambiar de guion, de inning de entrada o de vista reinicia el reloj.
  useEffect(() => {
    setElapsed(opening);
    setRunning(false);
    last.current = null;
  }, [opening]);

  useEffect(() => {
    if (!running || !script) return undefined;
    const id = window.setInterval(() => {
      const now = Date.now();
      const previous = last.current ?? now;
      last.current = now;
      const delta = (now - previous) / 1000;
      setElapsed((value) => {
        const next = value + delta * speed;
        return next >= duration ? duration : next;
      });
    }, 200);
    return () => {
      window.clearInterval(id);
      last.current = null;
    };
  }, [running, speed, script, duration]);

  useEffect(() => {
    if (duration > 0 && elapsed >= duration) setRunning(false);
  }, [duration, elapsed]);

  const play = useCallback(() => {
    last.current = null;
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    setRunning(false);
    last.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (running) {
      pause();
      return;
    }
    play();
  }, [pause, play, running]);

  const restart = useCallback(() => {
    pause();
    setElapsed(opening);
  }, [opening, pause]);

  const seek = useCallback(
    (seconds: number) => {
      last.current = null;
      setElapsed(Math.min(duration, Math.max(0, seconds)));
    },
    [duration],
  );

  const gotoInning = useCallback(
    (inning: number) => {
      if (!script) return;
      const size = secondsPerInning(script);
      const target = Math.min(script.innings, Math.max(1, Math.round(inning)));
      last.current = null;
      setElapsed((size * (target - 1)) / speed);
    },
    [script, speed],
  );

  const nextInning = useCallback(() => {
    if (!script) return;
    const current = clockAt(script, elapsed).inning;
    gotoInning(current + 1);
  }, [elapsed, gotoInning, script]);

  const prevInning = useCallback(() => {
    if (!script) return;
    const current = clockAt(script, elapsed).inning;
    gotoInning(current - 1);
  }, [elapsed, gotoInning, script]);

  return {
    elapsed,
    running,
    speed,
    duration,
    clock: script ? clockAt(script, elapsed) : null,
    play,
    pause,
    toggle,
    restart,
    seek,
    setSpeed,
    gotoInning,
    nextInning,
    prevInning,
  };
}

export type SimulationClockApi = ReturnType<typeof useSimulationClock>;
