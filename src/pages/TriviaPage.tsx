import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { TabBar } from "@/components/ui/TabBar";
import { trackEvent } from "@/services/analytics";
import { answerTrivia, todayTrivia, type TriviaQuestion, type TriviaResult } from "@/services/triviaApi";

type ResultMap = Record<string, TriviaResult>;

export function TriviaPage() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<ResultMap>({});
  const [pending, setPending] = useState<string | null>(null); // id de la pregunta en proceso
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    todayTrivia()
      .then((data) => {
        if (!alive) return;
        setQuestions(data.questions);
        setMessage(data.message ?? "");
        trackEvent("trivia_started");
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar la trivia.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onAnswer(questionId: string, optionId: string) {
    if (pending) return;
    setPending(questionId);
    setError("");
    try {
      const res = await answerTrivia(questionId, optionId);
      setResults((prev) => ({ ...prev, [questionId]: res }));
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, answered: true } : q)),
      );
      trackEvent("trivia_completed", { correct: res.correct, points: res.points });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar la respuesta.");
    } finally {
      setPending(null);
    }
  }

  const answered = questions.filter((q) => q.answered || results[q.id]).length;
  const total = questions.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-3">
        <BackButton onClick={() => navigate("/tobo")} />
        <div className="flex-1">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">
            Juégate el Tobo
          </p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Trivia del día</h2>
        </div>
        {total > 0 && (
          <span className="shrink-0 rounded-full bg-[#FFF1EA] px-3 py-1 text-[13px] font-extrabold text-[#FF4F1A]">
            {answered}/{total}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {error && (
          <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">
            {error}
          </p>
        )}

        {questions.length === 0 && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">
              {message || "Hoy no hay trivia disponible."}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
              Vuelve mañana para nuevas preguntas.
            </p>
          </div>
        )}

        {questions.map((q, idx) => {
          const result = results[q.id];
          const isAnswered = q.answered || Boolean(result);

          return (
            <div key={q.id} className="mb-4">
              {/* Question card */}
              <div className="rounded-[28px] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[11px] font-extrabold text-[#A08B80]">
                    Pregunta {idx + 1}
                  </span>
                  <span className="rounded-full bg-[#FFF1EA] px-2 py-0.5 text-[10px] font-extrabold text-[#FF4F1A]">
                    {q.category}
                  </span>
                  <span className="rounded-full bg-[#F3E4D8] px-2 py-0.5 text-[10px] font-extrabold text-[#8D7366]">
                    {q.difficulty}
                  </span>
                  <span className="ml-auto text-[11px] font-extrabold text-[#FF4F1A]">
                    +{q.points} pts
                  </span>
                </div>

                <p className="mt-3 text-[18px] font-extrabold leading-tight">{q.prompt}</p>

                {/* Options */}
                {!isAnswered && (
                  <div className="mt-4 flex flex-col gap-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={pending === q.id}
                        onClick={() => onAnswer(q.id, opt.id)}
                        className="min-h-[52px] rounded-2xl bg-[#FFF1EA] px-4 py-3 text-left text-[14px] font-extrabold text-[#241710] disabled:opacity-50"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Result */}
                {isAnswered && (
                  <div className="mt-4">
                    {result ? (
                      <>
                        <p
                          className={`text-[22px] font-extrabold ${result.correct ? "text-[#2E7D32]" : "text-[#E23B2F]"}`}
                        >
                          {result.correct ? "¡Correcto!" : "Incorrecto"}
                        </p>
                        {result.correct && (
                          <p className="mt-1 text-[15px] font-extrabold text-[#FF4F1A]">
                            +{result.points} puntos
                          </p>
                        )}
                        {!result.correct && (
                          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
                            Respuesta correcta:{" "}
                            {q.options.find((o) => o.id === result.correctOption)?.label}
                          </p>
                        )}
                        {result.explanation && (
                          <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">
                            {result.explanation}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[14px] font-semibold text-[#8D7366]">
                        Ya respondiste esta pregunta hoy.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* All done banner */}
        {total > 0 && answered === total && (
          <div className="rounded-[28px] bg-[#241710] px-6 py-6 text-center">
            <p className="text-[16px] font-extrabold text-white">
              ¡Trivia completa! {answered}/{total} respondidas.
            </p>
            <p className="mt-1 text-[13px] font-semibold text-white/70">
              Vuelve mañana para nuevas preguntas.
            </p>
            <button
              type="button"
              onClick={() => navigate("/tobo")}
              className="mt-4 h-11 w-full rounded-2xl bg-[#FF4F1A] text-[15px] font-extrabold text-white"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>

      <TabBar />
    </div>
  );
}
