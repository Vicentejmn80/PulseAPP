import { useState } from "react";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { IconFire } from "@/components/ui/icons";
import type { PredictionConfig } from "@/types/pulse";
import { GameResult } from "./GameResult";

export function PredictionPlay({
  title,
  points,
  config,
  selectedOptionId,
  alreadyPlayed,
  onSubmit,
  onExit,
  continueLabel,
  onContinue,
}: {
  title: string;
  points: number;
  config: PredictionConfig;
  selectedOptionId?: string;
  alreadyPlayed: boolean;
  onSubmit: (optionId: string) => void;
  onExit: () => void;
  continueLabel: string;
  onContinue: () => void;
}) {
  const [picked, setPicked] = useState(selectedOptionId ?? "");
  const [done, setDone] = useState(false);
  const closes = Date.parse(config.closeAt);
  const opens = Date.parse(config.openAt);
  const closed = !alreadyPlayed && (Date.now() < opens || Date.now() >= closes);

  if (closed) {
    return (
      <GameResult
        title={title}
        score={0}
        subtitle="Esta predicción ya no acepta picks"
        actionLabel={continueLabel}
        onAction={onContinue}
        secondaryLabel="Volver"
        onSecondary={onExit}
      />
    );
  }

  if (alreadyPlayed && !done) {
    const previous = config.options.find((option) => option.id === selectedOptionId)?.label;
    return (
      <GameResult
        title={title}
        score={0}
        subtitle={previous ? `Ya enviaste: ${previous}` : "Ya enviaste tu predicción"}
        actionLabel={continueLabel}
        onAction={onContinue}
        secondaryLabel="Volver"
        onSecondary={onExit}
      />
    );
  }

  if (done) {
    const label = config.options.find((option) => option.id === (selectedOptionId || picked))?.label;
    return (
      <GameResult
        title={title}
        score={points}
        subtitle={label ? `Tu pick: ${label}` : "Predicción enviada"}
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
        <BackButton onClick={onExit} />
        <p className="flex-1 truncate pr-9 text-center text-[14px] font-extrabold">{title}</p>
      </div>
      <div className="flex flex-1 flex-col px-5 py-6">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF1EA] text-[#FF4F1A]">
          <IconFire className="h-8 w-8" />
        </div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Predicción</p>
        <h2 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">{config.question}</h2>
        <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Elige ahora. El resultado se valida después.</p>
        <div className="mt-6 flex flex-col gap-3">
          {config.options.map((option) => {
            const on = picked === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setPicked(option.id)}
                className={`flex h-[72px] items-center justify-center rounded-[22px] border-2 text-[20px] font-extrabold ${
                  on ? "border-[#FF4F1A] bg-[#FFF1EA] text-[#FF4F1A]" : "border-[#F3E4D8] bg-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-4 pb-7">
        <PrimaryButton
          disabled={!picked}
          onClick={() => {
            onSubmit(picked);
            setDone(true);
          }}
        >
          Confirmar · +{points} pts
        </PrimaryButton>
      </div>
    </div>
  );
}
