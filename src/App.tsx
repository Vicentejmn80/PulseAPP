import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Notice, Shell } from "@/components/ui/Shell";
import { AdminCyclesPage } from "@/pages/AdminCyclesPage";
import { AdminLeaguesPage } from "@/pages/AdminLeaguesPage";
import { AdminMatchesPage } from "@/pages/AdminMatchesPage";
import { AdminSimulationPage } from "@/pages/AdminSimulationPage";
import { AdminTascasPage } from "@/pages/AdminTascasPage";
import { AdminTriviasPage } from "@/pages/AdminTriviasPage";
import { EnterPage } from "@/pages/EnterPage";
import { HomePage } from "@/pages/Home";
import { LeaguePage } from "@/pages/LeaguePage";
import { MatchPredictPage, MatchesPage } from "@/pages/MatchesPage";
import { MiQuinielaPage } from "@/pages/MiQuinielaPage";
import { PrizesPage } from "@/pages/PrizesPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { QrPage } from "@/pages/QrPage";
import { RankingPage } from "@/pages/RankingPage";
import { ReporterPage } from "@/pages/ReporterPage";
import { SimulatorPage } from "@/pages/SimulatorPage";
import { TascasPage } from "@/pages/TascasPage";
import { TriviaPage } from "@/pages/TriviaPage";
import { VenuePage } from "@/pages/VenuePage";
import { usePulse } from "@/state/PulseContext";

function GuestQr() {
  const { token = "" } = useParams();
  useEffect(() => {
    sessionStorage.setItem("pulse-after-login", `/q/${token}`);
  }, [token]);
  return <EnterPage hint="Entra para registrar tu visita en la tasca." />;
}

function GuestVenue() {
  const { slug = "" } = useParams();
  useEffect(() => {
    sessionStorage.setItem("pulse-after-login", `/venue/${slug}`);
  }, [slug]);
  return <VenuePage guest />;
}

function ResumeVisit() {
  const navigate = useNavigate();
  useEffect(() => {
    const next = sessionStorage.getItem("pulse-after-login");
    if (next?.startsWith("/q/") || next?.startsWith("/venue/") || next?.startsWith("/partidos/demo_")) {
      sessionStorage.removeItem("pulse-after-login");
      navigate(next, { replace: true });
    }
  }, [navigate]);
  return null;
}

export function App() {
  const { notice, status } = usePulse();

  if (status === "loading") {
    return (
      <Shell>
        <div className="flex h-[100dvh] items-center justify-center text-[18px] font-extrabold">Juégate el Tobo</div>
      </Shell>
    );
  }

  if (status === "guest") {
    return (
      <Shell>
        <div className="relative flex h-[100dvh] flex-col">
          <Routes>
            <Route path="/q/:token" element={<GuestQr />} />
            <Route path="/venue/:slug" element={<GuestVenue />} />
            <Route path="*" element={<EnterPage />} />
          </Routes>
          <Notice message={notice} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="relative flex h-[100dvh] flex-col">
        <ResumeVisit />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/mi-quiniela" element={<MiQuinielaPage />} />
          <Route path="/partidos" element={<MatchesPage />} />
          <Route path="/partidos/:matchId" element={<MatchPredictPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/ligas/:leagueId?" element={<LeaguePage />} />
          <Route path="/trivias" element={<TriviaPage />} />
          <Route path="/tascas" element={<TascasPage />} />
          <Route path="/premios" element={<PrizesPage />} />
          <Route path="/venue/:slug" element={<VenuePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/partidos" element={<AdminMatchesPage />} />
          <Route path="/admin/tascas" element={<AdminTascasPage />} />
          <Route path="/admin/trivias" element={<AdminTriviasPage />} />
          <Route path="/admin/ciclos" element={<AdminCyclesPage />} />
          <Route path="/admin/ligas" element={<AdminLeaguesPage />} />
          <Route path="/admin/simulador" element={<SimulatorPage />} />
          <Route path="/admin/simulacion" element={<AdminSimulationPage />} />
          <Route path="/reportar/:matchId" element={<ReporterPage />} />
          <Route path="/q/:token" element={<QrPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Notice message={notice} />
      </div>
    </Shell>
  );
}
