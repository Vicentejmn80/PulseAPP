import { useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/ui/Buttons";
import { IconBolt } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/Shell";
import type { QuickChallengeConfig } from "@/types/pulse";
import { GameResult } from "./GameResult";

export function QuickChallengePlay({
  title,
  config,
  alreadyPlayed,
  onFinish,
  onExit,
  continueLabel,
  onContinue,
}: {
  title: string;
  config: QuickChallengeConfig;
  alreadyPlayed: boolean;
  onFinish: (answer: number) => void;
  onExit: () => void;
  continueLabel: string;
  onContinue: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(config.timeLimit);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const saved = useRef(false);
  const letras = ["A", "B", "C", "D"];

  useEffect(() => {
    if (alreadyPlayed || done || picked !== null) return undefined;
    if (left <= 0) {
      setDone(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [alreadyPlayed, done, left, picked]);

  useEffect(() => {
    if (!done || alreadyPlayed || score <= 0 || saved.current) return;
    saved.current = true;
    if (picked === null) return;
    onFinish(picked);
  }, [alreadyPlayed, done, onFinish, picked, score]);

  function choose(i: number) {
    if (picked !== null || done || alreadyPlayed) return;
    setPicked(i);
    const earned = i === config.correctAnswer ? config.points : 0;
    setScore(earned);
    window.setTimeout(() => setDone(true), 700);
  }

  function retry() {
    setPicked(null);
    setLeft(config.timeLimit);
    setScore(0);
    setDone(false);
  }

  if (alreadyPlayed && !done) {
    return (
      <GameResult
        title={title}
        score={0}
        subtitle="Ya completaste este reto"
        actionLabel={continueLabel}
        onAction={onContinue}
        secondaryLabel="Volver"
        onSecondary={onExit}
      />
    );
  }

  if (done && score > 0) {
    return (
      <GameResult
        title={title}
        score={score}
        subtitle="¡A tiempo!"
        actionLabel={continueLabel}
        onAction={onContinue}
        secondaryLabel="Volver"
        onSecondary={onExit}
      />
    );
  }

  if (done) {
    return (
      <GameResult
        title={title}
        score={0}
        subtitle="Puedes intentarlo otra vez. Solo cuenta el acierto."
        actionLabel="Intentar de nuevo"
        onAction={retry}
        secondaryLabel="Ahora no"
        onSecondary={onExit}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 px-4 pt-3">
        <BackButton onClick={onExit} />
        <p className="flex-1 truncate pr-9 text-center text-[14px] font-extrabold">{title}</p>
      </div>
      <div className="px-5 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[13px] font-extrabold text-[#FF4F1A]">
            <IconBolt className="h-4 w-4" />
            {left}s
          </span>
          <span className="text-[11px] font-extrabold text-[#A08B80]">+{config.points} pts</span>
        </div>
        <ProgressBar value={left / config.timeLimit} />
      </div>
      <div className="flex flex-1 flex-col justify-center px-5 py-6">
        <h2 className="text-[22px] font-extrabold leading-snug tracking-tight">{config.question}</h2>
        <p className="mt-2 text-[13px] font-extrabold text-[#A08B80]">Elige rápido</p>
        <div className="mt-4 flex flex-col gap-2.5">
          {config.options.map((texto, i) => {
            const correcta = picked !== null && i === config.correctAnswer;
            const mala = picked === i && i !== config.correctAnswer;
            const cls = correcta ? "border-[#1C8A4A] bg-[#E8F8EE]" : mala ? "border-[#E23B2F] bg-[#FFE8E4]" : "border-[#F3E4D8] bg-white";
            return (
              <button
                key={texto}
                type="button"
                onClick={() => choose(i)}
                className={`flex h-[60px] items-center gap-3 rounded-[20px] border-2 px-3 text-left ${cls}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1EA] text-[14px] font-extrabold text-[#FF4F1A]">
                  {letras[i]}
                </span>
                <span className="text-[16px] font-extrabold">{texto}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
