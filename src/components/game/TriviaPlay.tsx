import { useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/ui/Buttons";
import { IconCoin } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/Shell";
import type { TriviaConfig } from "@/types/pulse";
import { GameResult } from "./GameResult";

export function TriviaPlay({
  title,
  category,
  config,
  alreadyPlayed,
  onFinish,
  onExit,
  continueLabel,
  onContinue,
}: {
  title: string;
  category: string;
  config: TriviaConfig;
  alreadyPlayed: boolean;
  onFinish: (answers: number[], points: number, questionsAnswered: number, correct: number) => void;
  onExit: () => void;
  continueLabel: string;
  onContinue: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const saved = useRef(false);
  const answers = useRef<number[]>([]);
  const total = config.questions.length;
  const question = config.questions[index];
  const letras = ["A", "B", "C", "D"];

  function choose(i: number) {
    if (picked !== null || alreadyPlayed) return;
    setPicked(i);
    answers.current[index] = i;
    if (i === question.correctAnswer) {
      setScore((n) => n + question.points);
      setCorrect((n) => n + 1);
    }
  }

  useEffect(() => {
    if (!done || alreadyPlayed || saved.current) return;
    saved.current = true;
    onFinish(answers.current.slice(), score, total, correct);
  }, [alreadyPlayed, correct, done, onFinish, score, total]);

  function next() {
    if (index + 1 >= total) {
      setDone(true);
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
  }

  if (alreadyPlayed && !done) {
    return (
      <GameResult
        title={title}
        score={0}
        subtitle="Ya jugaste esta trivia"
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
        score={score}
        actionLabel={continueLabel}
        onAction={onContinue}
        secondaryLabel="Volver"
        onSecondary={onExit}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 px-4 pt-3">
        <BackButton onClick={onExit} label="Cerrar" />
        <p className="flex-1 truncate pr-9 text-center text-[14px] font-extrabold">{title}</p>
      </div>
      <div className="px-5 pt-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-extrabold">
            Pregunta {index + 1} de {total}
          </span>
          <span className="rounded-full bg-[#FFF1EA] px-2 py-0.5 text-[11px] font-extrabold text-[#FF4F1A]">{category}</span>
        </div>
        <ProgressBar value={(index + (picked !== null ? 1 : 0)) / total} />
      </div>
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-5 py-4">
        <h2 className="text-[22px] font-extrabold leading-snug tracking-tight">{question.question}</h2>
        <p
          className={`mt-2 text-[13px] font-extrabold ${
            picked === null ? "text-[#A08B80]" : picked === question.correctAnswer ? "text-[#1C8A4A]" : "text-[#E23B2F]"
          }`}
        >
          {picked === null ? "Elige una respuesta" : picked === question.correctAnswer ? "¡Correcto!" : "Casi. La correcta está marcada."}
        </p>
        {picked !== null && question.explanation && (
          <p className="mt-1 text-[12px] font-semibold text-[#8D7366]">{question.explanation}</p>
        )}
        <div className="mt-4 flex flex-col gap-2.5">
          {question.options.map((texto, i) => {
            const correcta = picked !== null && i === question.correctAnswer;
            const mala = picked === i && i !== question.correctAnswer;
            const cls = correcta ? "border-[#1C8A4A] bg-[#E8F8EE]" : mala ? "border-[#E23B2F] bg-[#FFE8E4]" : "border-[#F3E4D8] bg-white";
            return (
              <button
                key={`${question.id}-${i}`}
                type="button"
                onClick={() => choose(i)}
                className={`flex h-[60px] items-center gap-3 rounded-[20px] border-2 px-3 text-left shadow-[0_6px_14px_rgba(80,40,10,0.04)] ${cls}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1EA] text-[14px] font-extrabold text-[#FF4F1A]">
                  {letras[i]}
                </span>
                <span className="truncate text-[16px] font-extrabold">{texto}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-4 pb-7">
        {picked !== null && (
          <button
            type="button"
            onClick={next}
            className="mb-3 flex h-12 w-full items-center justify-center rounded-2xl bg-[#241710] text-[15px] font-extrabold text-white"
          >
            {index + 1 >= total ? "Ver resultado" : "Siguiente"}
          </button>
        )}
        <div className="flex items-center gap-3 rounded-[22px] bg-[#2A1812] px-4 py-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#FFE08A] to-[#FFB11A] text-[#8A4E00]">
            <IconCoin className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-white/60">Si aciertas sumas</p>
            <p className="mt-0.5 text-[20px] font-extrabold leading-none text-white">+{question.points} puntos</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold text-white/50">En esta trivia</p>
            <p className="text-[16px] font-extrabold tabular-nums text-[#FFC53D]">{score} pts</p>
          </div>
        </div>
      </div>
    </div>
  );
}
