import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Check, X } from "lucide-react";
import { publicChallengeAnswers } from "@/lib/challenges/evaluate";
import { hydrateChallengeSelections, selectedChallengeRows, updateChallengeSelection } from "@/lib/challengeSelections";
import { trackEvent } from "@/services/analytics";
import { listMatchChallenges, saveChallengeAnswers, type GameChallenge } from "@/services/matchesApi";

export interface ChallengeHandle {
  answers: () => { challengeId: string; optionId: string }[] | null;
}

function optionLabel(challenge: GameChallenge, optionId: string | null | undefined) {
  return challenge.options.find((option) => option.id === optionId)?.label ?? optionId ?? "";
}

export const MatchChallenges = forwardRef<ChallengeHandle, { matchId: string; editable: boolean; predictionSaved?: boolean }>(function MatchChallenges(
  { matchId, editable, predictionSaved = false },
  ref,
) {
  const [rows, setRows] = useState<GameChallenge[]>([]);
  const [finished, setFinished] = useState(false);
  const [ready, setReady] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(!predictionSaved);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    setReady(false);
    setRows([]);
    setPicks({});
    listMatchChallenges(matchId)
      .then((board) => {
        if (!alive) return;
        setRows(board.challenges);
        setFinished(board.finished);
        setPicks(hydrateChallengeSelections(board.challenges));
        setEditing(!predictionSaved);
        setReady(true);
        if (board.challenges.length > 0) trackEvent("challenge_viewed", { matchId, count: board.challenges.length });
      })
      .catch(() => {
        if (alive) setReady(false);
      });
    return () => {
      alive = false;
    };
  }, [matchId, predictionSaved]);

  useImperativeHandle(ref, () => ({
    answers: () => {
      if (!ready || !editable) return null;
      return publicChallengeAnswers(Object.entries(picks).map(([challengeId, optionId]) => ({ challengeId, optionId })));
    },
  }), [editable, picks, ready]);

  if (!ready || rows.length === 0) return null;

  const selectedIds = Object.keys(picks);
  const selectedRows = selectedChallengeRows(rows, picks);
  const bonus = Math.min(3, selectedIds.length);
  const awarded = Math.min(3, rows.reduce((sum, challenge) => sum + (challenge.pointsAwarded ?? 0), 0));

  function choose(challengeId: string, optionId: string) {
    if (!editable || finished) return;
    const removing = picks[challengeId] === optionId;
    const result = updateChallengeSelection(picks, challengeId, optionId);
    setPicks(result.selections);
    setNotice(result.notice);
    if (result.notice) return;
    trackEvent(removing ? "challenge_deselected" : "challenge_selected", { matchId, challengeId });
  }

  async function saveEdits() {
    if (!editable || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const answers = publicChallengeAnswers(Object.entries(picks).map(([challengeId, optionId]) => ({ challengeId, optionId })));
      await saveChallengeAnswers(matchId, answers);
      const board = await listMatchChallenges(matchId);
      setRows(board.challenges);
      setPicks(hydrateChallengeSelections(board.challenges));
      setEditing(false);
      trackEvent("challenge_submitted", { matchId, count: answers.length });
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : "No se pudieron guardar tus retos.");
    } finally {
      setSaving(false);
    }
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
                  {hit ? "+1 PT" : "+0 PT"}
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

  if (!editing || !editable) {
    return (
      <section className="mt-5 border-t border-[#F3E4D8] pt-4">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#8D7366]">RETOS DEL PARTIDO · BONUS: HASTA +3 PT</p>
        <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Bonus secundario: +1 PT por cada reto correcto.</p>
        <p className="mt-3 text-[14px] font-extrabold text-[#241710]">Tus retos</p>
        {selectedRows.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {selectedRows.map((challenge) => (
              <article key={challenge.id} className="rounded-2xl bg-[#FFF7F1] px-3 py-3">
                <p className="text-[14px] font-extrabold text-[#23824A]"><Check className="mr-1 inline h-4 w-4" />{challenge.title}</p>
                <p className="mt-1 text-[13px] font-bold text-[#8D7366]">{optionLabel(challenge, picks[challenge.id])}</p>
                <p className="mt-1 text-[12px] font-extrabold text-[#FF4F1A]">+1 PT si aciertas</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Aún no elegiste retos.</p>
        )}
        {editable && (
          <button type="button" onClick={() => { setEditing(true); setNotice(""); }} className="mt-3 min-h-11 rounded-xl bg-[#FFF1EA] px-4 text-[13px] font-extrabold text-[#FF4F1A]">
            Editar retos
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="mt-5 border-t border-[#F3E4D8] pt-4">
      <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#8D7366]">RETOS DEL PARTIDO · BONUS: HASTA +3 PT</p>
      <h3 className="mt-1 text-[18px] font-extrabold text-[#241710]">Lee el juego. Gana puntos extra.</h3>
      <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
        {editable ? "+1 PT por cada reto correcto. El pronóstico principal vale hasta +80 PT." : "Bonus secundario: +1 PT por cada reto correcto."}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((challenge) => {
          const mine = picks[challenge.id];
          return (
            <article key={challenge.id} className="rounded-2xl bg-[#FFF7F1] px-3 py-3">
              <p className="text-[12px] font-extrabold text-[#FF4F1A]">+1 PT</p>
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
          <p className="text-[14px] font-extrabold text-[#FF4F1A]">Bonus seleccionado: hasta +{bonus} PT · máximo +3 PT</p>
          {notice && <p className="mt-2 text-[13px] font-bold text-[#E23B2F]">{notice}</p>}
          {predictionSaved && (
            <button type="button" disabled={saving} onClick={() => void saveEdits()} className="mt-3 min-h-12 w-full rounded-2xl bg-[#FF4F1A] px-4 text-[14px] font-extrabold text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          )}
        </>
      )}
    </section>
  );
});
