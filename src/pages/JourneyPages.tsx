import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { ProgressBar } from "@/components/ui/Shell";
import { WowBurst } from "@/components/world/Wow";
import { isJourney, missionsFor } from "@/data/mock/journey";
import { experienceRepository, venueRepository } from "@/services/repositories";
import { useJourney } from "@/state/useJourney";

export function MissionActionPage() {
  const { missionId } = useParams();
  const navigate = useNavigate();
  const mission = missionsFor("exp_doble").concat(missionsFor("exp_city")).find((item) => item.id === missionId);
  const journey = useJourney(mission?.experienceId ?? "exp_doble");
  const venue = venueRepository.getAll().find((item) => item.id === mission?.venueId);
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [burst, setBurst] = useState("");
  const done = mission ? journey.done.has(mission.id) : false;
  const open = mission ? journey.unlocked(mission) : false;

  if (!mission || !isJourney(mission.experienceId)) {
    return (
      <div className="flex h-full items-center justify-center">
        <button type="button" onClick={() => navigate("/")} className="font-extrabold text-[#FF4F1A]">Volver</button>
      </div>
    );
  }

  const experience = experienceRepository.getById(mission.experienceId);

  function finish() {
    const message = journey.complete(mission!, choice ?? undefined);
    if (message) {
      setError(message);
      return;
    }
    setBurst(`+${mission!.points}`);
    window.setTimeout(() => navigate(`/experience/${mission!.experienceId}`), 1200);
  }

  return (
    <div className="relative flex h-full flex-col">
      <WowBurst message={burst} onDone={() => setBurst("")} />
      <div className="flex h-11 items-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate(`/experience/${mission.experienceId}`)} />
        <p className="flex-1 pr-9 text-center text-[15px] font-extrabold">{experience?.name}</p>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-8">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">{mission.activityType}</p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight">{mission.title}</h1>
        <p className="mt-2 text-[14px] font-semibold text-[#8D7366]">{mission.description}</p>
        {venue && (
          <div className="mt-4 rounded-[22px] bg-white px-4 py-3">
            <p className="text-[16px] font-extrabold">{venue.name}</p>
            <p className="text-[13px] font-semibold text-[#8D7366]">{venue.address}</p>
          </div>
        )}
        <p className="mt-4 text-[16px] font-extrabold">{mission.prompt}</p>
        {mission.choices && (
          <div className="mt-3 flex flex-col gap-2">
            {mission.choices.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setChoice(index)}
                className={`h-14 rounded-2xl border-2 text-[15px] font-extrabold ${choice === index ? "border-[#FF4F1A] bg-[#FFF1EA] text-[#FF4F1A]" : "border-[#F3E4D8] bg-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {done && <p className="mt-4 text-[14px] font-extrabold text-[#1C8A4A]">{mission.wowLine || "Esta parte ya está hecha."}</p>}
        {!open && !done && <p className="mt-4 text-[14px] font-bold text-[#8D7366]">Primero termina lo anterior.</p>}
        <div className="mt-auto pt-6">
          <PrimaryButton disabled={done || !open || (Boolean(mission.choices) && choice === null)} onClick={finish}>
            {done ? "Lista" : mission.activityType === "final_challenge" ? "Cerrar el reto" : "Listo, lo hice"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function JourneyView({ experienceId }: { experienceId: string }) {
  const navigate = useNavigate();
  const journey = useJourney(experienceId);
  const experience = experienceRepository.getById(experienceId);
  if (!experience) return null;
  const ratio = journey.venues.length ? journey.venuesDone / journey.venues.length : 0;
  const position = Math.max(7 - Math.floor(journey.points / 120), 1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/")} />
        <p className="flex-1 pr-9 text-center text-[15px] font-extrabold">Experiencia</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">{experience.category}</p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight">{experience.name}</h1>
        <p className="mt-2 text-[14px] font-semibold text-[#8D7366]">
          {journey.venues.length} locales · {experience.winners} ganadores · {experience.daysLabel}
        </p>
        <div className="mt-4 rounded-[24px] bg-white p-4 shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
          <p className="text-[12px] font-extrabold">Tu progreso</p>
          <div className="mt-2">
            <ProgressBar value={ratio} />
          </div>
          <p className="mt-2 text-[13px] font-bold text-[#8D7366]">
            {journey.venuesDone} de {journey.venues.length} locales · {journey.points} pts
          </p>
        </div>

        {journey.next && (
          <button type="button" onClick={() => navigate(`/journey/${journey.next!.id}`)} className="mt-3 w-full rounded-[24px] bg-gradient-to-br from-[#FF8A3C] to-[#FF4F1A] p-4 text-left text-white">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/80">Siguiente misión</p>
            <h2 className="mt-1 text-[22px] font-extrabold leading-tight">{journey.next.title}</h2>
            <p className="mt-1 text-[13px] font-bold text-white/85">
              {journey.venues.find((venue) => venue.id === journey.next?.venueId)?.name} · +{journey.next.points} pts
            </p>
            <p className="mt-3 text-[15px] font-extrabold">Entrar al reto</p>
          </button>
        )}

        <div className="mt-4">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Locales</p>
          <div className="mt-2 flex flex-col gap-2">
            {journey.venues.map((venue) => {
              const mission = journey.missions.find((item) => item.venueId === venue.id);
              const complete = mission ? journey.done.has(mission.id) : false;
              return (
                <div key={venue.id} className="rounded-[20px] bg-white px-3 py-3">
                  <p className="text-[15px] font-extrabold">{complete ? "✓" : "○"} {venue.name}</p>
                  <p className="text-[12px] font-semibold text-[#8D7366]">{venue.address}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-[24px] bg-white p-4">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Lo que puedes desbloquear</p>
          <div className="mt-2 flex flex-col gap-2">
            {journey.rewards.map((reward) => {
              const open = reward.unlockMissionId ? journey.done.has(reward.unlockMissionId) : false;
              return (
                <p key={reward.id} className="text-[14px] font-extrabold">
                  {open ? "🎁" : "🔒"} {open ? reward.name : "???"}
                  {!open && <span className="ml-1 font-semibold text-[#8D7366]">Sigue la ruta</span>}
                </p>
              );
            })}
          </div>
        </div>

        <button type="button" onClick={() => navigate("/ranking")} className="mt-3 w-full rounded-[24px] bg-white p-4 text-left">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Tu posición</p>
          <p className="mt-1 text-[22px] font-extrabold">#{position}</p>
          <p className="text-[13px] font-semibold text-[#8D7366]">{journey.points} pts en esta experiencia</p>
        </button>

        <div className="mt-4">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Está pasando</p>
          <div className="mt-2 flex flex-col gap-2">
            {journey.feed.slice(0, 4).map((event) => (
              <p key={event.id} className="rounded-2xl bg-white px-3 py-3 text-[13px] font-extrabold">{event.text}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
