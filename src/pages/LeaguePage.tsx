import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Users } from "lucide-react";
import { RankingList } from "@/components/ranking/RankingList";
import { BackButton } from "@/components/ui/Buttons";
import { CardHead, GoldCta, ToboCard } from "@/components/tobo/surface";
import { TabBar } from "@/components/ui/TabBar";
import { pickActiveCycle } from "@/lib/toboHome";
import { createLeague, getLeague, getLeagueRanking, joinLeague, listMyLeagues, type League } from "@/services/leaguesApi";
import { listCycles } from "@/services/matchesApi";
import type { LeaderboardEntry } from "@/types/pulse";

type LeagueTab = "mis" | "crear" | "unirme" | "ranking";

export function LeaguePage() {
  const navigate = useNavigate();
  const { leagueId } = useParams<{ leagueId?: string }>();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const [tab, setTab] = useState<LeagueTab>(
    leagueId ? "ranking" : requested === "crear" || requested === "unirme" ? requested : "mis",
  );
  const [leagues, setLeagues] = useState<League[]>([]);
  const [current, setCurrent] = useState<League | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    listMyLeagues()
      .then((rows) => {
        if (!alive) return;
        setLeagues(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!leagueId) {
      setCurrent(null);
      setEntries([]);
      return;
    }
    let alive = true;
    setTab("ranking");
    Promise.all([getLeague(leagueId), listCycles()])
      .then(async ([league, cycles]) => {
        const cycleId = pickActiveCycle(cycles)?.id ?? "lifetime";
        const ranking = await getLeagueRanking(leagueId, cycleId);
        if (!alive) return;
        setCurrent(league);
        setEntries(ranking);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar la liga.");
      });
    return () => {
      alive = false;
    };
  }, [leagueId]);

  async function onCreate() {
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("Escribe un nombre para la liga.");
      return;
    }
    setPending(true);
    try {
      const league = await createLeague(name);
      setSuccess(`Liga "${league.name}" creada. Codigo: ${league.code}`);
      setLeagues((prev) => [league, ...prev]);
      setName("");
      navigate(`/tobo/ligas/${league.id}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la liga.");
    } finally {
      setPending(false);
    }
  }

  async function onJoin() {
    setError("");
    setSuccess("");
    if (!code.trim()) {
      setError("Escribe el codigo de invitacion.");
      return;
    }
    setPending(true);
    try {
      const league = await joinLeague(code);
      setSuccess(`Te uniste a "${league.name}".`);
      setLeagues((prev) => (prev.some((l) => l.id === league.id) ? prev : [league, ...prev]));
      setCode("");
      navigate(`/tobo/ligas/${league.id}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo unir a la liga.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/tobo/ranking")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">{current ? current.name : "Mis Ligas"}</h2>
        </div>
      </div>

      {!leagueId && (
        <div className="px-4 pb-2">
          <div className="grid grid-cols-3 gap-1">
            {(["mis", "crear", "unirme"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`h-11 rounded-2xl text-[12px] font-extrabold ${tab === t ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"}`}
              >
                {t === "mis" ? "Mis ligas" : t === "crear" ? "Crear" : "Unirme"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {success && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#2E7D32]">{success}</p>}

        {tab === "mis" && (
          <div className="flex flex-col gap-2">
            {leagues.length === 0 && (
              <div className="rounded-[28px] bg-white px-6 py-8 text-center">
                <p className="text-[16px] font-extrabold">Aun no tienes ligas</p>
                <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Crea una liga o unite con un codigo de invitacion.</p>
              </div>
            )}
            {leagues.map((league) => (
              <button
                key={league.id}
                type="button"
                onClick={() => navigate(`/tobo/ligas/${league.id}`)}
                className="rounded-[20px] px-4 py-4 text-left shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
                style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[16px] font-extrabold">{league.name}</p>
                  <span className="rounded-full bg-[#FFF1EA] px-2 py-1 text-[11px] font-extrabold text-[#FF4F1A]">
                    {league.memberCount} participantes
                  </span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Codigo: {league.code}</p>
              </button>
            ))}
          </div>
        )}

        {tab === "crear" && (
          <ToboCard>
            <CardHead icon={Users} title="Crear liga" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Ejemplos: Familia, Oficina, Los panas, Universidad.</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la liga"
              className="mt-4 h-12 w-full rounded-[14px] px-4 text-[15px] font-extrabold outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--t-text)" }}
            />
            <div className="mt-4">
              <GoldCta icon={Users} onClick={onCreate} disabled={pending}>
                Crear liga
              </GoldCta>
            </div>
          </ToboCard>
        )}

        {tab === "unirme" && (
          <ToboCard>
            <CardHead icon={Users} title="Unirme a una liga" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Pega el codigo de invitacion que te compartieron.</p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Codigo de 6 caracteres"
              className="mt-4 h-12 w-full rounded-[14px] px-4 text-[15px] font-extrabold uppercase outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--t-text)" }}
            />
            <div className="mt-4">
              <GoldCta icon={Users} onClick={onJoin} disabled={pending}>
                Unirme
              </GoldCta>
            </div>
          </ToboCard>
        )}

        {tab === "ranking" && (
          <>
            {current && (
              <ToboCard className="mb-3">
                <CardHead icon={Users} title="Codigo de invitacion" />
                <p className="text-[28px] font-extrabold uppercase tracking-[0.18em]">{current.code}</p>
                <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Comparte este codigo para invitar amigos.</p>
              </ToboCard>
            )}
            <RankingList entries={entries} subtitle="Ranking de la liga" emptyLabel="Todavia no hay jugadores en esta liga" />
          </>
        )}
      </div>
      <TabBar />
    </div>
  );
}
