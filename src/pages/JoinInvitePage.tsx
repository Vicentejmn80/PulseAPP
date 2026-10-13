import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GoldCta, GhostCta, ToboCard } from "@/components/tobo/surface";
import { TabBar } from "@/components/ui/TabBar";
import { LVBP_EXPERIENCE_TITLE } from "@/config/lvbpBrand";
import { LEAGUE_MAX_MEMBERS } from "@/config/leagues";
import { clearPendingLeagueCode, joinLeague, previewLeague, savePendingLeagueCode, type LeaguePreview } from "@/services/leaguesApi";
import { usePulse } from "@/state/PulseContext";

export function JoinInvitePage() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { status } = usePulse();
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    savePendingLeagueCode(code);
    previewLeague(code)
      .then(setPreview)
      .catch((reason: unknown) => {
        console.error("liga", reason);
        setError("No pudimos abrir esta invitación. Inténtalo de nuevo.");
      });
  }, [code]);

  useEffect(() => {
    if (status === "guest") {
      try {
        sessionStorage.setItem("pulse-after-login", `/tobo/unirse/${encodeURIComponent(code)}`);
        sessionStorage.setItem("rusher-league-autojoin", "1");
      } catch {
        /* modo privado */
      }
    }
  }, [code, status]);

  useEffect(() => {
    if (status !== "ready") return;
    let auto = false;
    try {
      auto = sessionStorage.getItem("rusher-league-autojoin") === "1";
    } catch {
      auto = false;
    }
    if (!auto || !code) return;
    let alive = true;
    joinLeague(code)
      .then((league) => {
        if (!alive) return;
        try {
          sessionStorage.removeItem("rusher-league-autojoin");
        } catch {
          /* modo privado */
        }
        clearPendingLeagueCode();
        navigate(`/tobo/ligas/${league.id}`, { replace: true });
      })
      .catch((reason: unknown) => {
        console.error("liga", reason);
        try {
          sessionStorage.removeItem("rusher-league-autojoin");
        } catch {
          /* modo privado */
        }
        const message = reason instanceof Error ? reason.message : "";
        if (alive) setError(message && !/[A-Z_]{4,}|SQL|column/i.test(message) ? message : "No pudimos unirte a la liga. Inténtalo de nuevo.");
      });
    return () => {
      alive = false;
    };
  }, [code, navigate, status]);

  async function join() {
    setBusy(true);
    setError("");
    try {
      const league = await joinLeague(code);
      clearPendingLeagueCode();
      navigate(`/tobo/ligas/${league.id}`);
    } catch (reason: unknown) {
      console.error("liga", reason);
      const message = reason instanceof Error ? reason.message : "";
      setError(message && !/[A-Z_]{4,}|SQL|column/i.test(message) ? message : "No pudimos unirte a la liga. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "guest") {
    return (
      <div className="flex h-full flex-col px-4 pt-8">
        <ToboCard>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>{LVBP_EXPERIENCE_TITLE}</p>
          <h1 className="mt-2 text-[24px] font-extrabold">Te invitaron a una liga</h1>
          <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>Entra o crea tu cuenta y te unimos al terminar.</p>
          <div className="mt-4">
            <GoldCta onClick={() => navigate("/")}>Entrar</GoldCta>
          </div>
        </ToboCard>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>{LVBP_EXPERIENCE_TITLE}</p>
        <h1 className="text-[24px] font-extrabold">Invitación</h1>
      </div>
      <div className="flex-1 px-4">
        <ToboCard>
          {preview?.ok === false && <p className="text-[15px] font-extrabold">{preview.error || "Ese código no es válido."}</p>}
          {preview?.ok && (
            <>
              <p className="text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>Te invitaron a {preview.name}</p>
              {preview.inviter && <p className="mt-2 text-[14px] font-bold">Te invita @{preview.inviter}</p>}
              <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>{preview.memberCount ?? 0} de {LEAGUE_MAX_MEMBERS} miembros</p>
              {preview.alreadyMember && <p className="mt-3 text-[14px] font-extrabold">Ya eres miembro de esta liga.</p>}
              {preview.full && <p className="mt-3 text-[14px] font-extrabold">La liga ya está llena.</p>}
              {!preview.alreadyMember && !preview.full && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <GoldCta onClick={() => void join()} disabled={busy}>Unirme</GoldCta>
                  <GhostCta onClick={() => { clearPendingLeagueCode(); navigate("/tobo"); }}>Ahora no</GhostCta>
                </div>
              )}
            </>
          )}
          {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        </ToboCard>
      </div>
      <TabBar />
    </div>
  );
}
