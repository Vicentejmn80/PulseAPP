import { useEffect, useMemo, useState } from "react";
import { COLLECTIONS, EXPERIENCE_MISSIONS, QR_INTERACTIONS, SECRET_EXPERIENCE } from "@/data/mock/world";
import { usePulse } from "@/state/PulseContext";
import type { ExperienceMission, QRInteraction } from "@/types/pulse";

const KEY = "pulse-world-v1";

interface WorldState {
  foundQrIds: string[];
}

function load(): WorldState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<WorldState>;
    return { foundQrIds: Array.isArray(raw.foundQrIds) ? raw.foundQrIds : [] };
  } catch {
    return { foundQrIds: [] };
  }
}

export function useWorld() {
  const pulse = usePulse();
  const [foundQrIds, setFoundQrIds] = useState<string[]>(() => load().foundQrIds);
  const [wow, setWow] = useState("");

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ foundQrIds }));
  }, [foundQrIds]);

  const found = useMemo(() => new Set(foundQrIds), [foundQrIds]);

  function stepDone(step: ExperienceMission["steps"][number]) {
    if (step.qrId) return found.has(step.qrId);
    if (step.gameId) return pulse.hasPlayed(step.gameId);
    return false;
  }

  function missionProgress(mission: ExperienceMission) {
    const done = mission.steps.filter(stepDone).length;
    return { done, total: mission.steps.length, complete: done >= mission.steps.length };
  }

  const route = EXPERIENCE_MISSIONS.find((mission) => mission.experienceId === pulse.featured.id) ?? EXPERIENCE_MISSIONS[0];
  const routeProgress = missionProgress(route);
  const collection = COLLECTIONS.find((item) => item.experienceId === pulse.featured.id) ?? COLLECTIONS[0];
  const collected = collection.items.filter((item) => found.has(item.qrId)).length;
  const discoveryPoints = QR_INTERACTIONS.filter((qr) => found.has(qr.id)).reduce((sum, qr) => sum + (qr.effect.points ?? 0), 0);
  const secretOpen = routeProgress.complete;
  const nextQr = QR_INTERACTIONS.find((qr) => qr.experienceId === pulse.featured.id && qr.effect.kind !== "unlock" && !found.has(qr.id));

  function findQr(qr: QRInteraction) {
    if (found.has(qr.id)) return;
    if (qr.id === "qr_cardenales" && collected < 3) {
      setWow("Te faltan piezas. Vuelve cuando tengas 3 de 4.");
      return;
    }
    setFoundQrIds((prev) => [...prev, qr.id]);
    setWow(`+${qr.effect.points ?? 0} pts`);
    if (qr.effect.clue) window.setTimeout(() => setWow(qr.effect.clue ?? ""), 900);
  }

  return {
    ...pulse,
    foundQrIds,
    wow,
    clearWow: () => setWow(""),
    route,
    routeProgress,
    collection,
    collected,
    discoveryPoints,
    secretOpen,
    nextQr,
    secretExperience: SECRET_EXPERIENCE,
    qrs: QR_INTERACTIONS.filter((qr) => qr.experienceId === pulse.featured.id),
    stepDone,
    findQr,
    missionProgress,
  };
}
