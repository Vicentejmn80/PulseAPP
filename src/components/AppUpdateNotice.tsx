import { useRegisterSW } from "virtual:pwa-register/react";

export function AppUpdateNotice() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="absolute bottom-20 left-3 right-3 z-[70] flex items-center gap-3 rounded-2xl px-3 py-2" style={{ backgroundColor: "#14171A", border: "1px solid #2A2F33" }}>
      <p className="min-w-0 flex-1 text-[12px] font-bold text-[#F5F7F2]">Hay una versión nueva</p>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-extrabold"
        style={{ backgroundColor: "#CFFF00", color: "#0B0D0F" }}
      >
        Actualizar
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)} className="shrink-0 text-[12px] font-bold text-[#C7CDD1]">
        Luego
      </button>
    </div>
  );
}
