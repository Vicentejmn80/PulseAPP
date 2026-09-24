import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { createId } from "@/lib/format";
import { usePulse } from "@/state/PulseContext";
import type { Game, GameType } from "@/types/pulse";

const EMPTY_FORM = { tipo: "trivia" as GameType, nombre: "", premio: "", pregunta: "", opciones: ["", "", "", ""] };

export function AdminCreatePage() {
  const navigate = useNavigate();
  const { featured, addGame, setNotice } = usePulse();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const tipos: Array<{ id: GameType; label: string }> = [
    { id: "trivia", label: "Trivia" },
    { id: "prediction", label: "Predicción" },
    { id: "quick_challenge", label: "Reto" },
  ];

  function setOpcion(index: number, value: string) {
    setForm((prev) => {
      const opciones = prev.opciones.slice();
      opciones[index] = value;
      return { ...prev, opciones };
    });
  }

  function publish(event: FormEvent) {
    event.preventDefault();
    const nombre = form.nombre.trim();
    const pregunta = form.pregunta.trim();
    const opciones = form.opciones.map((op) => op.trim()).filter(Boolean);
    if (!nombre || !pregunta || opciones.length < 2) {
      setError("Completa el título, la pregunta y al menos 2 respuestas.");
      return;
    }

    const game: Game =
      form.tipo === "prediction"
        ? {
            id: createId("c"),
            experienceId: featured.id,
            type: "prediction",
            title: nombre,
            description: form.premio.trim() || "Predicción",
            points: 100,
            status: "open",
            configuration: {
              kind: "prediction",
              question: pregunta,
              options: opciones.slice(0, 2).map((label, index) => ({ id: `opt_${index}`, label })),
              openAt: new Date().toISOString(),
              closeAt: new Date(Date.now() + 86400000).toISOString(),
            },
          }
        : form.tipo === "quick_challenge"
          ? {
              id: createId("c"),
              experienceId: featured.id,
              type: "quick_challenge",
              title: nombre,
              description: form.premio.trim() || "Reto rápido",
              points: 80,
              status: "open",
              configuration: {
                kind: "quick_challenge",
                variant: "speed_pick",
                question: pregunta,
                options: opciones,
                correctAnswer: 0,
                timeLimit: 12,
                points: 80,
              },
            }
          : {
              id: createId("c"),
              experienceId: featured.id,
              type: "trivia",
              title: nombre,
              description: form.premio.trim() || "Trivia",
              points: 50 * opciones.length,
              status: "open",
              configuration: {
                kind: "trivia",
                questions: [
                  {
                    id: createId("q"),
                    question: pregunta,
                    options: opciones,
                    correctAnswer: 0,
                    points: 50,
                  },
                ],
              },
            };

    addGame(game);
    setNotice("Publicado en la experiencia activa.");
    navigate(`/play/${game.id}`);
  }

  return (
    <form onSubmit={publish} className="flex h-full flex-col">
      <div className="flex h-11 items-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/")} />
        <p className="flex-1 pr-9 text-center text-[15px] font-extrabold">Crear</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <h2 className="text-[22px] font-extrabold tracking-tight">Nuevo juego</h2>
        <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Semilla de admin. Se agrega a {featured.name}.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {tipos.map((tipo) => (
            <button
              key={tipo.id}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, tipo: tipo.id }))}
              className={`h-11 rounded-2xl text-[13px] font-extrabold ${form.tipo === tipo.id ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"}`}
            >
              {tipo.label}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Título</span>
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Trivia relámpago"
            className="w-full rounded-2xl bg-white px-3.5 py-3 text-[16px] font-bold outline-none ring-1 ring-[#F3E4D8] placeholder:font-semibold placeholder:text-[#C4B0A6] focus:ring-2 focus:ring-[#FF4F1A]"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Nota interna</span>
          <input
            value={form.premio}
            onChange={(e) => setForm({ ...form, premio: e.target.value })}
            placeholder="Opcional"
            className="w-full rounded-2xl bg-white px-3.5 py-3 text-[16px] font-bold outline-none ring-1 ring-[#F3E4D8] placeholder:font-semibold placeholder:text-[#C4B0A6] focus:ring-2 focus:ring-[#FF4F1A]"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Pregunta</span>
          <textarea
            value={form.pregunta}
            onChange={(e) => setForm({ ...form, pregunta: e.target.value })}
            rows={2}
            placeholder="¿Quién gana hoy?"
            className="w-full resize-none rounded-2xl bg-white px-3.5 py-3 text-[16px] font-bold outline-none ring-1 ring-[#F3E4D8] placeholder:font-semibold placeholder:text-[#C4B0A6] focus:ring-2 focus:ring-[#FF4F1A]"
          />
        </label>
        <p className="mb-2 mt-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Respuestas · la A es la correcta</p>
        <div className="flex flex-col gap-2">
          {form.opciones.map((opcion, index) => (
            <input
              key={index}
              value={opcion}
              onChange={(e) => setOpcion(index, e.target.value)}
              placeholder={`Respuesta ${"ABCD"[index]}`}
              className="w-full rounded-2xl bg-white px-3.5 py-3 text-[16px] font-bold outline-none ring-1 ring-[#F3E4D8] placeholder:font-semibold placeholder:text-[#C4B0A6] focus:ring-2 focus:ring-[#FF4F1A]"
            />
          ))}
        </div>
        {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
      </div>
      <div className="shrink-0 px-4 pb-7 pt-2">
        <button
          type="submit"
          data-testid="publicar"
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#FF4F1A] text-[17px] font-extrabold text-white shadow-[0_12px_24px_rgba(255,79,26,0.35)]"
        >
          Publicar
        </button>
      </div>
    </form>
  );
}
