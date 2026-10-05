import { useEffect, useState } from "react";
import { listChallengeTemplates, setChallengeTemplate, type ChallengeTemplateRow } from "@/services/matchesApi";

export function ChallengeBankAdmin({ adminKey }: { adminKey: string }) {
  const [rows, setRows] = useState<ChallengeTemplateRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminKey.trim()) return;
    listChallengeTemplates(adminKey.trim())
      .then(setRows)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo abrir el banco."));
  }, [adminKey]);

  if (!adminKey.trim()) return null;

  async function toggle(row: ChallengeTemplateRow) {
    setError("");
    try {
      await setChallengeTemplate({ adminKey: adminKey.trim(), code: row.code, active: !row.active, title: row.title });
      setRows((current) => current.map((item) => (item.code === row.code ? { ...item, active: !item.active } : item)));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la plantilla.");
    }
  }

  return (
    <section className="mt-4 rounded-[24px] bg-white px-4 py-4">
      <p className="text-[16px] font-extrabold">Banco de retos</p>
      <p className="mt-1 text-[12px] font-semibold text-[#8D7366]">
        {rows.length} plantillas. Se asignan solas al crear el partido.
      </p>
      {error && <p className="mt-2 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
      <div className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
        {rows.map((row) => (
          <div key={row.code} className="rounded-2xl bg-[#FFF7F1] px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-extrabold leading-snug">{row.title}</p>
              <button type="button" onClick={() => void toggle(row)} className="shrink-0 text-[11px] font-extrabold text-[#FF4F1A]">
                {row.active ? "Activa" : "Pausada"}
              </button>
            </div>
            <p className="mt-1 text-[11px] font-bold text-[#8D7366]">
              {row.difficulty} · +{row.points} PT · {row.usage} usos
              {row.accuracy == null ? "" : ` · ${row.accuracy}% acierto`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
