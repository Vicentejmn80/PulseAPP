import { useState } from "react";
import { RUSHER_AVATARS } from "@/config/avatars";
import { Avatar } from "@/components/ui/Avatar";
import { saveAvatar } from "@/services/accountApi";
import { usePulse } from "@/state/PulseContext";

export function AvatarPicker() {
  const { currentUser, reload } = usePulse();
  const current = currentUser.avatarId && RUSHER_AVATARS.some((item) => item.id === currentUser.avatarId)
    ? currentUser.avatarId
    : "";
  const [selected, setSelected] = useState(current);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    if (!selected) return;
    setStatus("saving");
    setError("");
    try {
      await saveAvatar(selected);
      await reload();
      setStatus("saved");
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el avatar.");
    }
  }

  return (
    <section className="mt-5" aria-labelledby="mi-avatar">
      <h3 id="mi-avatar" className="px-1 text-[14px] font-extrabold">Mi avatar</h3>
      <p className="mt-1 px-1 text-[12px] font-semibold" style={{ color: "var(--t-muted)" }}>
        Elige una identidad original. No usa los escudos de los clubes.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Avatar initials={currentUser.initials} bg={currentUser.avatarColor} avatarId={selected || null} size={72} />
        <p className="text-[13px] font-extrabold">
          {RUSHER_AVATARS.find((item) => item.id === selected)?.name ?? "Sin elegir"}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2" role="listbox" aria-label="Avatares disponibles">
        {RUSHER_AVATARS.map((avatar) => {
          const active = selected === avatar.id;
          return (
            <button
              key={avatar.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                setSelected(avatar.id);
                setStatus("idle");
              }}
              className="flex flex-col items-center gap-1 rounded-2xl p-2 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#CFFF00]"
              style={{
                backgroundColor: active ? "var(--t-tint)" : "rgba(255,255,255,0.04)",
                border: active ? "1px solid var(--t-accent)" : "1px solid var(--t-border)",
                transform: active ? "scale(1.04)" : undefined,
              }}
            >
              <Avatar initials={currentUser.initials} bg={currentUser.avatarColor} avatarId={avatar.id} size={48} />
              <span className="text-[10px] font-extrabold">{avatar.name}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={!selected || status === "saving"}
        className="mt-3 min-h-11 w-full rounded-2xl text-[14px] font-extrabold disabled:opacity-50"
        style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
      >
        {status === "saving" ? "Guardando…" : "Guardar cambios"}
      </button>
      {status === "saved" && <p className="mt-2 text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>Avatar guardado.</p>}
      {status === "error" && <p className="mt-2 text-[12px] font-extrabold text-[#E23B2F]">{error}</p>}
    </section>
  );
}
