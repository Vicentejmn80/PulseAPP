import { useState } from "react";
import { RUSHER_AVATARS, isSelectableAvatar } from "@/config/avatars";
import { Avatar } from "@/components/ui/Avatar";
import { saveAvatar } from "@/services/accountApi";
import { usePulse } from "@/state/PulseContext";

export function AvatarPicker() {
  const { currentUser, reload } = usePulse();
  const saved = isSelectableAvatar(currentUser.avatarId) ? currentUser.avatarId ?? "" : "";
  const [selected, setSelected] = useState(saved);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function choose(id: string) {
    setSelected(id);
    setStatus("saving");
    setError("");
    try {
      await saveAvatar(id);
      await reload();
      setStatus("saved");
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el avatar.");
    }
  }

  return (
    <section className="mt-5" aria-labelledby="mi-avatar">
      {!saved ? (
        <p className="mb-3 rounded-2xl bg-[#C6FF3D] px-3 py-3 text-[13px] font-extrabold text-[#0B0D0F]">
          Elige tu avatar
        </p>
      ) : null}
      <h3 id="mi-avatar" className="px-1 text-[14px] font-extrabold">Tu equipo</h3>
      <p className="mt-1 px-1 text-[12px] font-semibold" style={{ color: "var(--t-muted)" }}>
        Toca un avatar para guardarlo. Puedes cambiarlo cuando quieras.
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2" role="listbox" aria-label="Avatares de equipo">
        {RUSHER_AVATARS.map((avatar) => {
          const active = selected === avatar.id;
          return (
            <button
              key={avatar.id}
              type="button"
              role="option"
              aria-selected={active}
              disabled={status === "saving"}
              onClick={() => void choose(avatar.id)}
              className="flex min-h-11 flex-col items-center gap-1 rounded-2xl p-2 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C6FF3D]"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                boxShadow: active ? "0 0 0 2px #C6FF3D" : "0 0 0 1px var(--t-border)",
              }}
            >
              <span className="relative">
                <Avatar initials={currentUser.initials} bg={currentUser.avatarColor} avatarId={avatar.id} size={56} />
                {active ? (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#C6FF3D] text-[11px] font-extrabold text-[#0B0D0F]">✓</span>
                ) : null}
              </span>
              <span className="text-[10px] font-extrabold">{avatar.name}</span>
            </button>
          );
        })}
      </div>
      {status === "saved" && <p className="mt-2 text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>Avatar guardado.</p>}
      {status === "error" && <p className="mt-2 text-[12px] font-extrabold text-[#E23B2F]">{error}</p>}
    </section>
  );
}
