import { useNavigate } from "react-router-dom";
import { LIVE_EVENTS } from "@/data/mock/world";
import { formato } from "@/lib/format";
import { useWorld } from "@/state/useWorld";
import { Countdown, WowBurst } from "@/components/world/Wow";
import { IconCoin } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/LogoMark";
import { TabBar } from "@/components/ui/TabBar";
import { ProgressBar } from "@/components/ui/Shell";

export function HomePage() {
  const navigate = useNavigate();
  const world = useWorld();
  const myRank = world.leaderboard.find((entry) => entry.isCurrentUser);
  const above = world.leaderboard.find((entry) => entry.position === (myRank?.position ?? 2) - 1);
  const gap = world.pointsToClimb;
  const predictionPlayed = world.hasPlayed("game_prediction_today");
  const rewardKnown = world.routeProgress.done > 0 || world.experiencePoints >= 800;
  const happening = [
    !predictionPlayed ? { id: "pred", icon: "🎯", title: "Predice el juego de hoy", meta: "+100 pts", to: "/play/game_prediction_today" } : null,
    world.nextQr ? { id: "qr", icon: "📍", title: world.nextQr.secret ? "Encuentra el código escondido" : world.nextQr.title, meta: `+${world.nextQr.effect.points ?? 0} pts`, to: `/discover/${world.nextQr.id}` } : null,
    gap ? { id: "rank", icon: "🏆", title: above ? `Alcanza a ${above.user.handle}` : "Sube en el ranking", meta: `${formato(gap)} pts`, to: "/ranking" } : null,
  ].filter(Boolean) as Array<{ id: string; icon: string; title: string; meta: string; to: string }>;

  return (
    <div className="relative flex h-full flex-col">
      <WowBurst message={world.wow} onDone={world.clearWow} />
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <div>
            <p className="text-[18px] font-extrabold leading-none tracking-tight">Pulse</p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#A08B80]">¿Qué puedes hacer ahora?</p>
          </div>
        </div>
        <button type="button" onClick={() => navigate("/profile")} className="flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-[0_6px_16px_rgba(80,40,10,0.08)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFC53D] text-[#8A4E00]">
            <IconCoin className="h-4 w-4" />
          </span>
          <span className="text-[13px] font-extrabold tabular-nums">{formato(world.totalPoints + world.discoveryPoints)}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <section className="rounded-[28px] bg-gradient-to-br from-[#FF8A3C] via-[#FF4F1A] to-[#E8360C] p-4 text-white shadow-[0_16px_32px_rgba(255,79,26,0.28)]">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/80">{world.featured.name}</p>
          <h2 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight">{happening.length} cosas están pasando ahora</h2>
          <div className="mt-3 flex flex-col gap-2">
            {happening.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(item.to)} className="flex items-center gap-3 rounded-2xl bg-white/15 px-3 py-3 text-left">
                <span className="text-[20px]">{item.icon}</span>
                <span className="flex-1 text-[15px] font-extrabold">{item.title}</span>
                <span className="text-[12px] font-extrabold text-white/85">{item.meta}</span>
              </button>
            ))}
            {happening.length === 0 && <p className="text-[14px] font-bold">Listo por ahora. Mira el ranking o la ruta.</p>}
          </div>
          <button
            type="button"
            onClick={() => navigate(happening[0]?.to ?? `/mission/${world.route.id}`)}
            className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-white text-[17px] font-extrabold text-[#FF4F1A]"
          >
            Empezar
          </button>
        </section>

        <button type="button" onClick={() => navigate(`/mission/${world.route.id}`)} className="mt-3 w-full rounded-[24px] bg-white p-4 text-left shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Misión activa</p>
          <h3 className="mt-1 text-[20px] font-extrabold">{world.route.title}</h3>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">{world.route.description}</p>
          <div className="mt-3">
            <ProgressBar value={world.routeProgress.total ? world.routeProgress.done / world.routeProgress.total : 0} />
            <p className="mt-1.5 text-[12px] font-extrabold text-[#8D7366]">
              {world.routeProgress.done} / {world.routeProgress.total} · +{formato(world.route.points)} pts · {world.route.badgeName}
            </p>
          </div>
          <p className="mt-3 text-[14px] font-extrabold text-[#FF4F1A]">Ver ruta</p>
        </button>

        {world.nextQr && (
          <button type="button" onClick={() => navigate(`/discover/${world.nextQr!.id}`)} className="mt-3 w-full rounded-[24px] bg-white p-4 text-left shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Hay algo cerca</p>
            <h3 className="mt-1 text-[18px] font-extrabold">{world.nextQr.secret ? "Un código secreto está activo." : world.nextQr.hint}</h3>
            <Countdown until={world.nextQr.activeUntil} />
            <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">{world.nextQr.distanceLabel ? `A ${world.nextQr.distanceLabel}.` : "En un local participante."}</p>
            <p className="mt-3 text-[14px] font-extrabold text-[#FF4F1A]">Ir a descubrir</p>
          </button>
        )}

        <button type="button" onClick={() => navigate("/ranking")} className="mt-3 w-full rounded-[24px] bg-white p-4 text-left shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Competencia</p>
          <h3 className="mt-1 text-[22px] font-extrabold">Estás #{myRank?.position ?? "—"}</h3>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
            {above && gap ? `Te faltan ${formato(gap)} pts para alcanzar a ${above.user.handle}.` : "Vas primero en esta experiencia."}
          </p>
          <p className="mt-3 text-[14px] font-extrabold text-[#FF4F1A]">Ver ranking</p>
        </button>

        <div className="mt-3 rounded-[24px] bg-white p-4 shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Recompensa</p>
          {rewardKnown ? (
            <>
              <h3 className="mt-1 text-[20px] font-extrabold">Tobo de cerveza</h3>
              <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
                {world.experiencePoints >= 800 ? "Listo para canjear cuando el local lo active." : `Te faltan ${formato(800 - world.experiencePoints)} pts de juego. La ruta suma aparte.`}
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-1 text-[20px] font-extrabold">???</h3>
              <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Avanza la ruta para descubrir qué se desbloquea.</p>
            </>
          )}
        </div>

        <button type="button" onClick={() => navigate(`/mission/${world.route.id}`)} className="mt-3 w-full rounded-[24px] bg-white p-4 text-left shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Colección</p>
          <h3 className="mt-1 text-[18px] font-extrabold">{world.collection.title}</h3>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
            {world.collected} / {world.collection.items.length} · {world.collection.unlockLabel}
          </p>
        </button>

        <div className="mt-3 rounded-[24px] border-2 border-dashed border-[#F3C7B4] bg-white/70 p-4">
          {world.secretOpen ? (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Desbloqueado</p>
              <h3 className="mt-1 text-[18px] font-extrabold">{world.secretExperience.name}</h3>
              <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">{world.secretExperience.description}</p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Bloqueado</p>
              <h3 className="mt-1 text-[18px] font-extrabold">Hay una noche que todavía no ves</h3>
              <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Completa La Ruta del Tobo para abrirla.</p>
            </>
          )}
        </div>

        <div className="mt-4">
          <p className="px-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Ahora en Pulse</p>
          <div className="mt-2 flex flex-col gap-2">
            {LIVE_EVENTS.map((event) => (
              <div key={event.id} className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                <p className="text-[13px] font-extrabold">{event.text}</p>
                <p className="text-[11px] font-bold text-[#A08B80]">{event.at}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <TabBar />
    </div>
  );
}
