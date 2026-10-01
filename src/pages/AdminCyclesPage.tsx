import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { storedAdminKey } from "@/lib/adminKey";
import { closeRound, createCycle, listCycles, type ToboCycle } from "@/services/matchesApi";

export function AdminCyclesPage() {
  const navigate = useNavigate();
  const adminKey = storedAdminKey();
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", startsOn: "", endsOn: "" });

  useEffect(() => {
    if (!adminKey) return;
    let alive = true;
    load();
    return () => {
      alive = false;
    };
    async function load() {
      try {
        const rows = await listCycles();
        if (alive) setCycles(rows);
      } catch (reason: unknown) {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los ciclos.");
      }
    }
  }, [adminKey]);

  async function onClose(cycleId: string) {
    if (!adminKey) return;
    setError("");
    setSuccess("");
    try {
      const result = await closeRound({ adminKey, cycleId });
      setSuccess(`Ciclo cerrado. ${result.awarded ?? 0} ganadores.`);
      setCycles(await listCycles());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo cerrar el ciclo.");
    }
  }

  async function onCreate() {
    if (!adminKey) return;
    setError("");
    setSuccess("");
    if (!form.id.trim() || !form.name.trim() || !form.startsOn || !form.endsOn) {
      setError("Completa todos los campos.");
      return;
    }
    setPending(true);
    try {
      await createCycle({ adminKey, id: form.id, name: form.name, startsOn: form.startsOn, endsOn: form.endsOn });
      setSuccess("Ciclo creado.");
      setForm({ id: "", name: "", startsOn: "", endsOn: "" });
      setShowCreate(false);
      setCycles(await listCycles());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear el ciclo.");
    } finally {
      setPending(false);
    }
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
        <BackButton onClick={() => navigate("/profile")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Super Admin</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Ciclos y premios</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {success && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#2E7D32]">{success}</p>}

        <button
          type="button"
          onClick={() => setShowCreate((s) => !s)}
          className="mb-3 h-12 w-full rounded-2xl bg-[#FFF1EA] text-[14px] font-extrabold text-[#FF4F1A]"
        >
          {showCreate ? "Cancelar" : "Crear ciclo"}
        </button>

        {showCreate && (
          <div className="mb-3 rounded-[24px] bg-white px-4 py-4">
            <input
              type="text"
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="ID del ciclo (ej. ronda_4)"
              className="mb-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-4 text-[14px] font-extrabold outline-none placeholder:text-[#A08B80]"
            />
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del ciclo"
              className="mb-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-4 text-[14px] font-extrabold outline-none placeholder:text-[#A08B80]"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={form.startsOn}
                onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
                className="h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-extrabold outline-none"
              />
              <input
                type="date"
                value={form.endsOn}
                onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))}
                className="h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-extrabold outline-none"
              />
            </div>
            <div className="mt-3">
              <PrimaryButton onClick={onCreate} disabled={pending}>
                Crear ciclo
              </PrimaryButton>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {cycles.map((cycle) => (
            <div key={cycle.id} className="rounded-[24px] bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[16px] font-extrabold">{cycle.name}</p>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${
                    cycle.status === "open" ? "bg-[#FFF1EA] text-[#FF4F1A]" : "bg-[#F3E4D8] text-[#8D7366]"
                  }`}
                >
                  {cycle.status}
                </span>
              </div>
              <p className="text-[13px] font-semibold text-[#8D7366]">
                {cycle.startsOn} al {cycle.endsOn}
              </p>
              {cycle.status === "open" && (
                <button
                  type="button"
                  onClick={() => onClose(cycle.id)}
                  className="mt-3 h-10 rounded-2xl bg-[#241710] px-4 text-[12px] font-extrabold text-white"
                >
                  Cerrar ciclo y asignar ganadores
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
