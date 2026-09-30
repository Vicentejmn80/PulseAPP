/**
 * Sonido de la experiencia.
 *
 * No buscamos assets: el soporte queda preparado. Si mas adelante hay archivos
 * de audio, se pasan a SOUND_FILES y suenan en vez de los tonos.
 *
 * El navegador exige un gesto del usuario antes de dejar sonar, asi que el
 * reproductor arranca silencioso y se activa solo despues de la primera
 * interaccion.
 */

export const SoundCue = {
  enter: "enter",
  hit: "hit",
  homer: "homer",
  tension: "tension",
  /** Apertura de un Momento Pulse. */
  pulse: "pulse",
  /** Apertura del ultimo inning. */
  ultimate: "ultimate",
  answer: "answer",
  correct: "correct",
  wrong: "wrong",
} as const;

export type SoundCueName = (typeof SoundCue)[keyof typeof SoundCue];

/** Cuando existan los assets reales, se mapearan aqui por nombre de cue. */
export const SOUND_FILES: Partial<Record<SoundCueName, string>> = {};

interface Tone {
  frequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  /** Segundos de retraso antes de sonar. */
  delay?: number;
}

const TONES: Record<SoundCueName, Tone[]> = {
  enter: [{ frequency: 320, duration: 0.16, type: "sine", gain: 0.06 }],
  hit: [{ frequency: 520, duration: 0.09, type: "triangle", gain: 0.05 }],
  homer: [
    { frequency: 440, duration: 0.1, type: "sawtooth", gain: 0.06 },
    { frequency: 660, duration: 0.14, type: "sawtooth", gain: 0.06, delay: 0.09 },
  ],
  tension: [{ frequency: 180, duration: 0.3, type: "sine", gain: 0.05 }],
  pulse: [
    { frequency: 380, duration: 0.1, type: "triangle", gain: 0.05 },
    { frequency: 560, duration: 0.14, type: "triangle", gain: 0.05, delay: 0.08 },
  ],
  ultimate: [
    { frequency: 260, duration: 0.16, type: "square", gain: 0.05 },
    { frequency: 390, duration: 0.2, type: "square", gain: 0.05, delay: 0.14 },
  ],
  answer: [{ frequency: 600, duration: 0.07, type: "sine", gain: 0.04 }],
  correct: [
    { frequency: 620, duration: 0.1, type: "sine", gain: 0.05 },
    { frequency: 830, duration: 0.13, type: "sine", gain: 0.05, delay: 0.08 },
  ],
  wrong: [{ frequency: 200, duration: 0.18, type: "sine", gain: 0.05 }],
};

export interface Soundboard {
  play: (cue: SoundCueName) => void;
  enable: () => void;
  muted: boolean;
}

export function createSoundboard(): Soundboard {
  let context: AudioContext | null = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    return context;
  }

  function playFile(url: string) {
    const audio = new Audio(url);
    audio.volume = 0.5;
    void audio.play().catch(() => undefined);
  }

  return {
    get muted() {
      return muted;
    },
    enable() {
      muted = false;
      const ctx = ensure();
      if (ctx?.state === "suspended") void ctx.resume();
    },
    play(cue) {
      if (muted) return;
      const file = SOUND_FILES[cue];
      if (file) {
        playFile(file);
        return;
      }
      const ctx = ensure();
      if (!ctx || ctx.state === "suspended") return;

      for (const tone of TONES[cue]) {
        const start = ctx.currentTime + (tone.delay ?? 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.frequency, start);
        gain.gain.setValueAtTime(tone.gain, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + tone.duration);
      }
    },
  };
}
