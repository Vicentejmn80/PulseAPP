import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { TabBar } from "@/components/ui/TabBar";
import { trackEvent } from "@/services/analytics";
import { answerTrivia, todayTrivia, type TriviaQuestion, type TriviaResult } from "@/services/triviaApi";

export function TriviaPage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState<TriviaQuestion | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<TriviaResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    todayTrivia()
      .then((data) => {
        if (!alive) return;
        setQuestion(data.question);
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

  async function onAnswer(optionId: string) {
    if (!question || pending) return;
    setPending(true);
    setError("");
    try {
      const res = await answerTrivia(question.id, optionId);
      setResult(res);
      trackEvent("trivia_completed", { correct: res.correct, points: res.points });
      setQuestion((q) => (q ? { ...q, answered: true } : q));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar la respuesta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Trivia del dia</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        {!question && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">{message || "Hoy no hay trivia disponible."}</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Vuelve manana para una nueva pregunta.</p>
          </div>
        )}

        {question && !result && !question.answered && (
          <div className="rounded-[28px] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#FFF1EA] px-2 py-1 text-[11px] font-extrabold text-[#FF4F1A]">{question.category}</span>
              <span className="rounded-full bg-[#F3E4D8] px-2 py-1 text-[11px] font-extrabold text-[#8D7366]">{question.difficulty}</span>
            </div>
            <p className="mt-4 text-[20px] font-extrabold leading-tight">{question.prompt}</p>
            <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">+{question.points} puntos</p>
            <div className="mt-5 flex flex-col gap-2">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={pending}
                  onClick={() => onAnswer(option.id)}
                  className="h-14 rounded-2xl bg-[#FFF1EA] px-4 text-left text-[14px] font-extrabold text-[#241710] disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {question && (result || question.answered) && (
          <div className="rounded-[28px] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Resultado</p>
            {result?.correct ? (
              <p className="mt-2 text-[28px] font-extrabold text-[#2E7D32]">Correcto</p>
            ) : (
              <p className="mt-2 text-[28px] font-extrabold text-[#E23B2F]">Incorrecto</p>
            )}
            {result && (
              <p className="mt-1 text-[16px] font-extrabold">
                {result.correct ? `+${result.points} puntos` : "Sigue practicando."}
              </p>
            )}
            {result?.explanation && <p className="mt-3 text-[14px] font-semibold text-[#8D7366]">{result.explanation}</p>}
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-5 h-12 w-full rounded-2xl bg-[#FF4F1A] text-[16px] font-extrabold text-white"
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
