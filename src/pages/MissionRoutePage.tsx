import { useNavigate, useParams } from "react-router-dom";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { ProgressBar } from "@/components/ui/Shell";
import { EXPERIENCE_MISSIONS, QR_INTERACTIONS } from "@/data/mock/world";
import { useWorld } from "@/state/useWorld";

export function MissionRoutePage() {
  const { missionId } = useParams();
  const navigate = useNavigate();
  const world = useWorld();
  const mission = EXPERIENCE_MISSIONS.find((item) => item.id === missionId) ?? world.route;
  const progress = world.missionProgress(mission);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/")} />
        <p className="flex-1 pr-9 text-center text-[15px] font-extrabold">Misión</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">{mission.layers.join(" · ")}</p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight">{mission.title}</h1>
        <p className="mt-2 text-[14px] font-semibold text-[#8D7366]">{mission.description}</p>
        <div className="mt-4">
          <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
          <p className="mt-1.5 text-[12px] font-extrabold text-[#8D7366]">
            {progress.done} / {progress.total}
            {progress.complete ? " · Misión completa" : ""}
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {mission.steps.map((step) => {
            const done = world.stepDone(step);
            const qr = QR_INTERACTIONS.find((item) => item.id === step.qrId);
            return (
              <button
                key={step.id}
                type="button"
                disabled={done}
                onClick={() => {
                  if (step.qrId) navigate(`/discover/${step.qrId}`);
                  if (step.gameId) navigate(`/play/${step.gameId}`);
                }}
                className="flex items-center gap-3 rounded-[20px] bg-white px-3 py-3 text-left shadow-[0_8px_20px_rgba(80,40,10,0.05)] disabled:opacity-70"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-extrabold ${done ? "bg-[#E8F8EE] text-[#1C8A4A]" : "bg-[#FFF1EA] text-[#FF4F1A]"}`}>
                  {done ? "✓" : "○"}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-extrabold">{done ? step.label : step.label}</span>
                  {!done && qr?.secret && <span className="text-[12px] font-semibold text-[#8D7366]">Todavía no sabes dónde está.</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 rounded-[22px] bg-white p-4">
          <p className="text-[12px] font-extrabold text-[#A08B80]">Al completar</p>
          <p className="mt-1 text-[18px] font-extrabold">+{mission.points} pts · {mission.badgeName}</p>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
            {progress.complete || !mission.hideRewardUntilComplete ? "El tobo queda a la vista." : "La recompensa se revela al terminar."}
          </p>
        </div>
        <div className="mt-4">
          <p className="text-[12px] font-extrabold text-[#A08B80]">{world.collection.title}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {world.collection.items.map((item) => {
              const owned = world.foundQrIds.includes(item.qrId);
              const locked = item.id === "item_cardenales" && world.collected < 3 && !owned;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => !owned && !locked && navigate(`/discover/${item.qrId}`)}
                  className="rounded-2xl bg-white px-1 py-3 text-center text-[11px] font-extrabold shadow-[0_6px_16px_rgba(80,40,10,0.05)]"
                >
                  {owned ? item.label : locked ? "???" : item.label}
                </button>
              );
            })}
          </div>
        </div>
        {!progress.complete && (
          <div className="mt-5">
            <PrimaryButton
              onClick={() => {
                const next = mission.steps.find((step) => !world.stepDone(step));
                if (next?.qrId) navigate(`/discover/${next.qrId}`);
                else if (next?.gameId) navigate(`/play/${next.gameId}`);
              }}
            >
              Seguir la ruta
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
