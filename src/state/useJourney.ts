import { useEffect, useState } from "react";
import { FEED, JOURNEY_REWARDS, JOURNEY_VENUES, CITY_STOPS, missionsFor } from "@/data/mock/journey";
import type { CommercialAction, ExperienceMission } from "@/types/pulse";

const KEY = "pulse-journey-v1";

interface Saved {
  done: string[];
  actions: CommercialAction[];
  note: string;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Saved>;
    return {
      done: Array.isArray(raw.done) ? raw.done : [],
      actions: Array.isArray(raw.actions) ? raw.actions : [],
      note: typeof raw.note === "string" ? raw.note : "",
    };
  } catch {
    return { done: [], actions: [], note: "" };
  }
}

export function useJourney(experienceId: string) {
  const [saved, setSaved] = useState<Saved>(load);
  const missions = missionsFor(experienceId);
  const done = new Set(saved.done);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, [saved]);

  function unlocked(mission: ExperienceMission) {
    return (mission.requiresMissionIds ?? []).every((id) => done.has(id));
  }

  const visible = missions.filter((mission) => unlocked(mission) || done.has(mission.id));
  const next = missions.find((mission) => !done.has(mission.id) && unlocked(mission)) ?? null;
  const venueStops = experienceId === "exp_city" ? CITY_STOPS : JOURNEY_VENUES.filter((venue) => venue.experienceIds?.includes(experienceId));
  const venuesDone = venueStops.filter((venue) => missions.some((mission) => mission.venueId === venue.id && done.has(mission.id))).length;
  const points = missions.filter((mission) => done.has(mission.id)).reduce((sum, mission) => sum + mission.points, 0);
  const rewards = JOURNEY_REWARDS.filter((reward) => reward.experienceId === experienceId);
  const feed = [
    ...(saved.note ? [{ id: "local", experienceId, text: saved.note, at: "ahora" }] : []),
    ...FEED.filter((event) => event.experienceId === experienceId),
  ];

  function complete(mission: ExperienceMission, choice?: number) {
    if (done.has(mission.id) || !unlocked(mission)) return "Esa misión todavía no está abierta.";
    if (mission.choices && choice !== mission.correctChoice) return "Esa no era. Inténtalo otra vez.";
    const action: CommercialAction | null = mission.commercialAction
      ? {
          id: `act_${Date.now()}`,
          type: mission.commercialAction,
          venueId: mission.venueId,
          experienceId,
          missionId: mission.id,
          userId: "local",
          timestamp: new Date().toISOString(),
        }
      : null;
    setSaved((prev) => ({
      done: [...prev.done, mission.id],
      actions: action ? [action, ...prev.actions] : prev.actions,
      note: mission.unlocksMissionId ? "Desbloqueaste la siguiente misión" : "Cerraste esta parte de la experiencia",
    }));
    return "";
  }

  return { missions, visible, next, done, unlocked, venues: venueStops, venuesDone, points, rewards, feed, actions: saved.actions, complete };
}
