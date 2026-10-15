import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { RusherSplash } from "@/components/ui/RusherSplash";
import { Notice, Shell } from "@/components/ui/Shell";
import { ToboLayout } from "@/components/tobo/ToboLayout";
import { AdminCyclesPage } from "@/pages/AdminCyclesPage";
import { AdminLeaguesPage } from "@/pages/AdminLeaguesPage";
import { AdminMatchesPage } from "@/pages/AdminMatchesPage";
import { AdminSimulationPage } from "@/pages/AdminSimulationPage";
import { AdminTascasPage } from "@/pages/AdminTascasPage";
import { AdminTriviasPage } from "@/pages/AdminTriviasPage";
import { EnterPage } from "@/pages/EnterPage";
import { HomePage } from "@/pages/Home";
import { JoinInvitePage } from "@/pages/JoinInvitePage";
import { LeaguePage } from "@/pages/LeaguePage";
import { MatchPredictPage, MatchesPage } from "@/pages/MatchesPage";
import { MiQuinielaPage } from "@/pages/MiQuinielaPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { PulseExperienciasPage } from "@/pages/PulseExperienciasPage";
import { PulseHomePage } from "@/pages/PulseHomePage";
import { PulsePerfilPage } from "@/pages/PulsePerfilPage";
import { PulsePremiosPage } from "@/pages/PulsePremiosPage";
import { QrPage } from "@/pages/QrPage";
import { RankingPage } from "@/pages/RankingPage";
import { ScanQrPage } from "@/pages/ScanQrPage";
import { ReporterPage } from "@/pages/ReporterPage";
import { SimulatorPage } from "@/pages/SimulatorPage";
import { TascasPage } from "@/pages/TascasPage";
import { TriviaPage } from "@/pages/TriviaPage";
import { AllyLandingPage } from "@/pages/AllyLandingPage";
import { ClasificacionPage } from "@/pages/ClasificacionPage";
import { AdminConsole } from "@/components/admin/AdminFrame";
import { AlliesAdminPage } from "@/pages/admin/AlliesAdminPage";
import { BaseballAdminPage } from "@/pages/admin/BaseballAdminPage";
import { DashboardPage } from "@/pages/admin/DashboardPage";
import { LedgerAdminPage } from "@/pages/admin/LedgerAdminPage";
import { TeamAdminPage } from "@/pages/admin/TeamAdminPage";
import { UsersAdminPage } from "@/pages/admin/UsersAdminPage";
import { VenuePage } from "@/pages/VenuePage";
import { callRpc } from "@/services/accountApi";
import { usePulse } from "@/state/PulseContext";

/* ── Guest helpers for QR / venue landing ── */
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

function GuestAdmin() {
  useEffect(() => {
    sessionStorage.setItem("pulse-after-login", "/admin");
  }, []);
  return <EnterPage hint="Entra con tu cuenta para abrir la administración." />;
}

function GuestAlly() {
  const { code = "" } = useParams();
  useEffect(() => {
    const clean = code.trim().toLowerCase();
    sessionStorage.setItem("rusher-campaign", clean);
    sessionStorage.setItem("pulse-after-login", `/aliado/${encodeURIComponent(clean)}`);
    if (/^[a-z0-9]{6,32}$/.test(clean)) {
      callRpc("pulse_campaign_open", { p_code: clean }).catch(() => undefined);
    }
  }, [code]);
  return <EnterPage hint="Entra para recibir la recompensa de este local." />;
}

function GuestJoin() {
  const { code = "" } = useParams();
  useEffect(() => {
    try {
      sessionStorage.setItem("rusher-league-join-code", code.trim().toUpperCase());
      sessionStorage.setItem("rusher-league-autojoin", "1");
      sessionStorage.setItem("pulse-after-login", `/tobo/unirse/${encodeURIComponent(code)}`);
    } catch {
      /* modo privado */
    }
  }, [code]);
  return <EnterPage hint="Entra para unirte a la liga." />;
}

/* ── Backward-compat redirects for printed QR codes ── */
function QrRedirect() {
  const { token = "" } = useParams();
  return <Navigate to={`/tobo/q/${token}`} replace />;
}
function VenueRedirect() {
  const { slug = "" } = useParams();
  return <Navigate to={`/tobo/venue/${slug}`} replace />;
}

/* ── Resume a pending deep-link after login ── */
function ResumeVisit() {
  const navigate = useNavigate();
  useEffect(() => {
    const next = sessionStorage.getItem("pulse-after-login");
    if (
      next?.startsWith("/q/") ||
      next?.startsWith("/venue/") ||
      next?.startsWith("/partidos/demo_") ||
      next?.startsWith("/tobo/") ||
      next?.startsWith("/unirse/") ||
      next?.startsWith("/admin") ||
      next?.startsWith("/aliado/")
    ) {
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
        <div className="flex h-[100dvh] flex-col" style={{ backgroundColor: "#1A1D21" }}>
          <RusherSplash />
        </div>
      </Shell>
    );
  }

  if (status === "guest") {
    return (
      <Shell>
        <div className="relative flex h-[100dvh] min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <Routes>
              <Route path="/q/:token"          element={<GuestQr />} />
              <Route path="/venue/:slug"       element={<GuestVenue />} />
              <Route path="/unirse/:code"      element={<GuestJoin />} />
              <Route path="/tobo/unirse/:code" element={<GuestJoin />} />
              <Route path="/admin"             element={<GuestAdmin />} />
              <Route path="/admin/*"           element={<GuestAdmin />} />
              <Route path="/aliado/:code"      element={<GuestAlly />} />
              <Route path="*"                  element={<EnterPage />} />
            </Routes>
          </div>
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
          {/* ── Pulse home + top-level Pulse pages ── */}
          <Route path="/"              element={<PulseHomePage />} />
          <Route path="/experiencias"  element={<PulseExperienciasPage />} />
          <Route path="/premios"       element={<PulsePremiosPage />} />
          <Route path="/perfil"        element={<PulsePerfilPage />} />

          {/* ── Tobo experience (all under /tobo) ── */}
          <Route path="/tobo" element={<ToboLayout />}>
            <Route index                        element={<HomePage />} />
            <Route path="mi-quiniela"           element={<MiQuinielaPage />} />
            <Route path="partidos"              element={<MatchesPage />} />
            <Route path="partidos/:matchId"     element={<MatchPredictPage />} />
            <Route path="ranking"               element={<RankingPage />} />
            <Route path="clasificacion"         element={<ClasificacionPage />} />
            <Route path="unirse/:code"          element={<JoinInvitePage />} />
            <Route path="ligas/:leagueId?"      element={<LeaguePage />} />
            <Route path="trivias"               element={<TriviaPage />} />
            <Route path="tascas"                element={<TascasPage />} />
            <Route path="premios"               element={<Navigate to="/tobo" replace />} />
            <Route path="venue/:slug"           element={<VenuePage />} />
            <Route path="profile"               element={<ProfilePage />} />
            <Route path="q/:token"              element={<QrPage />} />
            <Route path="escanear"              element={<ScanQrPage />} />
          </Route>

          <Route path="/admin" element={<AdminConsole />}>
            <Route index element={<DashboardPage />} />
            <Route path="usuarios" element={<UsersAdminPage />} />
            <Route path="beisbol" element={<BaseballAdminPage />} />
            <Route path="clasificacion" element={<ClasificacionPage embedded />} />
            <Route path="aliados" element={<AlliesAdminPage />} />
            <Route path="movimientos" element={<LedgerAdminPage />} />
            <Route path="equipo" element={<TeamAdminPage />} />
          </Route>
          <Route path="/aliado/:code" element={<AllyLandingPage />} />

          {/* ── Admin (paths unchanged) ── */}
          <Route path="/admin/partidos"    element={<AdminMatchesPage />} />
          <Route path="/admin/tascas"      element={<AdminTascasPage />} />
          <Route path="/admin/trivias"     element={<AdminTriviasPage />} />
          <Route path="/admin/ciclos"      element={<AdminCyclesPage />} />
          <Route path="/admin/ligas"       element={<AdminLeaguesPage />} />
          <Route path="/admin/simulador"   element={<SimulatorPage />} />
          <Route path="/admin/simulacion"  element={<AdminSimulationPage />} />
          <Route path="/reportar/:matchId" element={<ReporterPage />} />

          {/* ── Legacy QR/venue redirects (backward compat for printed QR codes) ── */}
          <Route path="/unirse/:code" element={<JoinInvitePage />} />
          <Route path="/q/:token"    element={<QrRedirect />} />
          <Route path="/venue/:slug" element={<VenueRedirect />} />

          {/* ── Fallback ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Notice message={notice} />
      </div>
    </Shell>
  );
}
