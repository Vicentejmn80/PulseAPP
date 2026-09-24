import type { Mission, MissionProgress, Participation } from "@/types/pulse";

function countRequirement(type: string, participations: Participation[]) {
  const matching = participations.filter((item) => item.type === type);
  if (type === "trivia") {
    const answered = matching.reduce((sum, item) => sum + (item.metadata?.questionsAnswered ?? 1), 0);
    return answered;
  }
  return matching.length;
}

export function getMissionProgress(mission: Mission, participations: Participation[]): MissionProgress {
  const requirementProgress = mission.requirements.map((requirement) => {
    const current = countRequirement(requirement.type, participations);
    return {
      requirement,
      current: Math.min(current, requirement.count),
      done: current >= requirement.count,
    };
  });

  return {
    mission,
    completed: requirementProgress.every((item) => item.done),
    requirementProgress,
  };
}
