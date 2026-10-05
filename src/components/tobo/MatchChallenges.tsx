import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Check, X } from "lucide-react";
import { publicChallengeAnswers } from "@/lib/challenges/evaluate";
import { trackEvent } from "@/services/analytics";
import { listMatchChallenges, type GameChallenge } from "@/services/matchesApi";

export interface ChallengeHandle {
  answers: () => { challengeId: string; optionId: string }[] | null;
}

function optionLabel(challenge: GameChallenge, optionId: string | null | undefined) {
  return challenge.options.find((option) => option.id === optionId)?.label ?? optionId ?? "";
}

export const MatchChallenges = forwardRef<ChallengeHandle, { matchId: string; editable: boolean }>(function MatchChallenges(
  { matchId, editable },
  ref,
) {
  const [rows, setRows] = useState<GameChallenge[]>([]);
  const [finished, setFinished] = useState(false);
  const [ready, setReady] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    listMatchChallenges(matchId)
      .then((board) => {
        if (!alive) return;
        setRows(board.challenges);
        setFinished(board.finished);
        const saved: Record<string, string> = {};
        for (const challenge of board.challenges) {
          if (challenge.myOption) saved[challenge.id] = challenge.myOption;
        }
        setPicks(saved);
        setReady(true);
        if (board.challenges.length > 0) trackEvent("challenge_viewed", { matchId, count: board.challenges.length });
      })
      .catch(() => {
        if (alive) setReady(false);
      });
    return () => {
      alive = false;
    };
  }, [matchId]);

  useImperativeHandle(ref, () => ({
    answers: () => {
      if (!ready || !editable) return null;
      return publicChallengeAnswers(Object.entries(picks).map(([challengeId, optionId]) => ({ challengeId, optionId })));
    },
  }), [editable, picks, ready]);

  if (!ready || rows.length === 0) return null;

  const selectedIds = Object.keys(picks);
  const bonus = rows.filter((challenge) => picks[challenge.id]).reduce((sum, challenge) => sum + challenge.points, 0);
  const awarded = rows.reduce((sum, challenge) => sum + (challenge.pointsAwarded ?? 0), 0);

  function choose(challengeId: string, optionId: string) {
    if (!editable || finished) return;
    if (picks[challengeId] === optionId) {
      const next = { ...picks };
      delete next[challengeId];
      setPicks(next);
      setNotice("");
      trackEvent("challenge_deselected", { matchId, challengeId });
      return;
    }
    if (!picks[challengeId] && selectedIds.length >= 3) {
      setNotice("Ya elegiste 3 retos. Cambia uno para seleccionar otro.");
      return;
    }
    setPicks({ ...picks, [challengeId]: optionId });
    setNotice("");
    trackEvent("challenge_selected", { matchId, challengeId });
  }

  if (finished) {
    const mine = rows.filter((challenge) => challenge.myOption);
    if (mine.length === 0) return null;
    return (
      <section className="mt-3 rounded-[24px] bg-white px-4 py-4">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Resultado de tus retos</p>
        <div className="mt-3 flex flex-col gap-2">
          {mine.map((challenge) => {
            const hit = challenge.correct === true;
            return (
              <article key={challenge.id} className="rounded-2xl bg-[#FFF7F1] px-3 py-3">
                <p className={`text-[13px] font-extrabold ${hit ? "text-[#FF4F1A]" : "text-[#8D7366]"}`}>
                  {hit ? <Check className="mr-1 inline h-4 w-4" /> : <X className="mr-1 inline h-4 w-4" />}
                  {hit ? `+${challenge.pointsAwarded ?? challenge.points} PT` : `+${challenge.points} PT`}
                </p>
                <p className="mt-1 text-[15px] font-extrabold text-[#241710]">{challenge.title}</p>
                <p className="mt-1 text-[13px] font-bold text-[#8D7366]">
                  {optionLabel(challenge, challenge.myOption)} — {hit ? "Acertaste" : "No acertaste"}
                </p>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Bonus del partido</p>
        <p className="text-[22px] font-extrabold text-[#FF4F1A]">+{awarded} PT</p>
      </section>
    );
  }

  return (
    <section className="mt-5 border-t border-[#F3E4D8] pt-4">
      <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Retos del partido</p>
      <h3 className="mt-1 text-[18px] font-extrabold text-[#241710]">Lee el juego. Gana puntos extra.</h3>
      <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
        {editable ? "Elige hasta 3. Si no quieres, guarda solo el pronóstico." : "Estos retos ya quedaron cerrados."}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((challenge) => {
          const mine = picks[challenge.id];
          return (
            <article key={challenge.id} className="rounded-2xl bg-[#FFF7F1] px-3 py-3">
              <p className="text-[12px] font-extrabold text-[#FF4F1A]">+{challenge.points} PT</p>
              <p className="mt-1 text-[15px] font-extrabold leading-snug text-[#241710]">{challenge.title}</p>
              {editable ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {challenge.options.map((option) => {
                    const on = mine === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => choose(challenge.id, option.id)}
                        className={`min-h-11 rounded-xl px-2 py-2 text-[13px] font-extrabold ${on ? "bg-[#FF4F1A] text-white" : "bg-white text-[#241710]"}`}
                      >
                        {option.label}{on ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-[13px] font-extrabold text-[#241710]">
                  {mine ? optionLabel(challenge, mine) : "No lo elegiste"}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {editable && (
        <>
          <p className="mt-3 text-[13px] font-extrabold text-[#241710]">{selectedIds.length}/3 seleccionados</p>
          <p className="text-[14px] font-extrabold text-[#FF4F1A]">Puedes ganar hasta +{bonus} PT</p>
          {notice && <p className="mt-2 text-[13px] font-bold text-[#E23B2F]">{notice}</p>}
        </>
      )}
    </section>
  );
});
