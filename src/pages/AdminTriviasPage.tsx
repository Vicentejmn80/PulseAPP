import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { storedAdminKey } from "@/lib/adminKey";
import { listTriviaAdmin, saveTriviaAdmin, setTriviaStatusAdmin, type TriviaAdminQuestion } from "@/services/triviaApi";

type Tab = "lista" | "nueva";

export function AdminTriviasPage() {
  const navigate = useNavigate();
  const adminKey = storedAdminKey();
  const [tab, setTab] = useState<Tab>("lista");
  const [questions, setQuestions] = useState<TriviaAdminQuestion[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  const [editing, setEditing] = useState<Partial<TriviaAdminQuestion>>({
    prompt: "",
    options: [
      { id: "a", label: "" },
      { id: "b", label: "" },
      { id: "c", label: "" },
      { id: "d", label: "" },
    ],
    correctOption: "",
    explanation: "",
    category: "general",
    difficulty: "medium",
    status: "draft",
    publishDate: new Date().toISOString().slice(0, 10),
    points: 5,
  });

  useEffect(() => {
    if (!adminKey) return;
    let alive = true;
    listTriviaAdmin(adminKey)
      .then((rows) => {
        if (alive) setQuestions(rows);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar.");
      });
    return () => {
      alive = false;
    };
  }, [adminKey]);

  async function load() {
    if (!adminKey) return;
    const rows = await listTriviaAdmin(adminKey);
    setQuestions(rows);
  }

  async function onSave() {
    setError("");
    setSuccess("");
    if (!adminKey) {
      setError("No tienes clave de admin.");
      return;
    }
    if (!editing.prompt?.trim()) {
      setError("Escribe la pregunta.");
      return;
    }
    const validOptions = (editing.options ?? []).filter((o) => o.label.trim());
    if (validOptions.length < 2) {
      setError("Necesitas al menos dos opciones.");
      return;
    }
    if (!editing.correctOption) {
      setError("Selecciona la opcion correcta.");
      return;
    }
    setPending(true);
    try {
      await saveTriviaAdmin(adminKey, {
        id: editing.id,
        prompt: editing.prompt,
        options: validOptions,
        correctOption: editing.correctOption,
        explanation: editing.explanation,
        category: editing.category || "general",
        difficulty: editing.difficulty || "medium",
        status: editing.status || "draft",
        publishDate: editing.publishDate || null,
        points: editing.points || 5,
      });
      setSuccess("Trivia guardada.");
      setTab("lista");
      setEditing({
        prompt: "",
        options: [
          { id: "a", label: "" },
          { id: "b", label: "" },
          { id: "c", label: "" },
          { id: "d", label: "" },
        ],
        correctOption: "",
        explanation: "",
        category: "general",
        difficulty: "medium",
        status: "draft",
        publishDate: new Date().toISOString().slice(0, 10),
        points: 5,
      });
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  }

  async function onToggleStatus(q: TriviaAdminQuestion) {
    if (!adminKey) return;
    const next = q.status === "active" ? "draft" : "active";
    try {
      await setTriviaStatusAdmin(adminKey, q.id, next);
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo cambiar el estado.");
    }
  }

  function setOption(id: string, label: string) {
    setEditing((prev) => ({
      ...prev,
      options: (prev.options ?? []).map((o) => (o.id === id ? { ...o, label } : o)),
    }));
  }

  if (!adminKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[16px] font-extrabold">Necesitas clave de admin</p>
        <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Ingresa desde el perfil con una clave valida.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/tobo/profile")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Super Admin</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Trivias</h2>
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="grid grid-cols-2 gap-1">
          {(["lista", "nueva"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-11 rounded-2xl text-[12px] font-extrabold ${tab === t ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"}`}
            >
              {t === "lista" ? "Biblioteca" : "Nueva trivia"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {success && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#2E7D32]">{success}</p>}

        {tab === "lista" && (
          <div className="flex flex-col gap-2">
            {questions.map((q) => (
              <div key={q.id} className="rounded-[24px] bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-extrabold">{q.prompt}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-extrabold ${
                      q.status === "active" ? "bg-[#FFF1EA] text-[#FF4F1A]" : "bg-[#F3E4D8] text-[#8D7366]"
                    }`}
                  >
                    {q.status}
                  </span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
                  {q.category} · {q.difficulty} · +{q.points} pts · {q.publishDate || "Sin fecha"}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleStatus(q)}
                    className="h-10 rounded-2xl bg-[#FFF1EA] px-3 text-[12px] font-extrabold text-[#FF4F1A]"
                  >
                    {q.status === "active" ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(q);
                      setTab("nueva");
                    }}
                    className="h-10 rounded-2xl bg-[#F3E4D8] px-3 text-[12px] font-extrabold text-[#8D7366]"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}
            {questions.length === 0 && <p className="text-center text-[14px] font-semibold text-[#8D7366]">No hay trivias cargadas.</p>}
          </div>
        )}

        {tab === "nueva" && (
          <div className="rounded-[28px] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">{editing.id ? "Editar trivia" : "Nueva trivia"}</p>
            <input
              type="text"
              value={editing.prompt}
              onChange={(e) => setEditing((p) => ({ ...p, prompt: e.target.value }))}
              placeholder="Pregunta"
              className="mt-4 h-12 w-full rounded-2xl bg-[#FFF7F1] px-4 text-[15px] font-extrabold outline-none placeholder:text-[#A08B80]"
            />
            <div className="mt-3 flex flex-col gap-2">
              {(editing.options ?? []).map((opt) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctOption"
                    checked={editing.correctOption === opt.id}
                    onChange={() => setEditing((p) => ({ ...p, correctOption: opt.id }))}
                    className="h-5 w-5 accent-[#FF4F1A]"
                  />
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => setOption(opt.id, e.target.value)}
                    placeholder={`Opcion ${opt.id.toUpperCase()}`}
                    className="h-11 flex-1 rounded-2xl bg-[#FFF7F1] px-4 text-[14px] font-extrabold outline-none placeholder:text-[#A08B80]"
                  />
                </div>
              ))}
            </div>
            <textarea
              value={editing.explanation || ""}
              onChange={(e) => setEditing((p) => ({ ...p, explanation: e.target.value }))}
              placeholder="Explicacion (opcional)"
              className="mt-3 min-h-[80px] w-full rounded-2xl bg-[#FFF7F1] p-4 text-[14px] font-extrabold outline-none placeholder:text-[#A08B80]"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={editing.category}
                onChange={(e) => setEditing((p) => ({ ...p, category: e.target.value }))}
                className="h-12 rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-extrabold outline-none"
              >
                <option value="general">General</option>
                <option value="historia">Historia LVBP</option>
                <option value="equipos">Equipos</option>
                <option value="jugadores">Jugadores</option>
                <option value="estadios">Estadios</option>
                <option value="curiosidades">Curiosidades</option>
              </select>
              <select
                value={editing.difficulty}
                onChange={(e) => setEditing((p) => ({ ...p, difficulty: e.target.value }))}
                className="h-12 rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-extrabold outline-none"
              >
                <option value="easy">Facil</option>
                <option value="medium">Media</option>
                <option value="hard">Dificil</option>
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="date"
                value={editing.publishDate || ""}
                onChange={(e) => setEditing((p) => ({ ...p, publishDate: e.target.value }))}
                className="h-12 rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-extrabold outline-none"
              />
              <input
                type="number"
                value={editing.points}
                onChange={(e) => setEditing((p) => ({ ...p, points: Number(e.target.value) }))}
                placeholder="Puntos"
                className="h-12 rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-extrabold outline-none"
              />
            </div>
            <div className="mt-4">
              <PrimaryButton onClick={onSave} disabled={pending}>
                Guardar trivia
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
