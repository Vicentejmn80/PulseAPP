import { Navigate, Route, Routes } from "react-router-dom";
import { Notice, Shell } from "@/components/ui/Shell";
import { AdminCreatePage } from "@/pages/AdminCreate";
import { ChallengesPage } from "@/pages/Challenges";
import { ExperiencePage } from "@/pages/ExperiencePage";
import { GamePage } from "@/pages/GamePage";
import { EnterPage } from "@/pages/EnterPage";
import { DiscoverPage } from "@/pages/DiscoverPage";
import { HomePage } from "@/pages/Home";
import { MissionRoutePage } from "@/pages/MissionRoutePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RankingPage } from "@/pages/RankingPage";
import { usePulse } from "@/state/PulseContext";

export function App() {
  const { notice, status } = usePulse();

  if (status === "loading") {
    return (
      <Shell>
        <div className="flex h-[100dvh] items-center justify-center text-[18px] font-extrabold">Pulse</div>
      </Shell>
    );
  }

  if (status === "guest") {
    return (
      <Shell>
        <div className="relative flex h-[100dvh] flex-col">
          <EnterPage />
          <Notice message={notice} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="relative flex h-[100dvh] flex-col">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/mission/:missionId" element={<MissionRoutePage />} />
          <Route path="/discover/:qrId" element={<DiscoverPage />} />
          <Route path="/experience/:experienceId" element={<ExperiencePage />} />
          <Route path="/play/:gameId" element={<GamePage />} />
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/create" element={<AdminCreatePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Notice message={notice} />
      </div>
    </Shell>
  );
}
