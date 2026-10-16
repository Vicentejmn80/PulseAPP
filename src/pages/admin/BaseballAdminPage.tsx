import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Chip, Empty, Field, Notice, Primary, Refresh, Skeleton, inputClass, when } from "@/components/admin/AdminFrame";
import { settlementNotice } from "@/lib/adminConsole";
import { previewCopy } from "@/lib/adminCrm";
import { canSettle, EARLY_RESULT_ERROR, MODAL_TIE_ERROR, resultPreviewLine, SCORE_CAP, winnerFromScores } from "@/lib/resultsBoard";
import { dayHeading } from "@/lib/matchAgenda";
import { caracasDateKey } from "@/lib/toboHome";
import { adminCall, asAdminFailure, type MatchBoardRow } from "@/services/adminConsoleApi";
import { listCycles, listMatches, type BaseballMatch, type ToboCycle } from "@/services/matchesApi";
import type { AdminFailure } from "@/lib/adminConsole";

type Bucket = "pending" | "upcoming" | "settled" | "cancelled";

type BoardResponse = {
  ok?: boolean;
  matches?: MatchBoardRow[];
  serverNow?: string;
  total?: number;
};

type Draft = {
  id: string;
  awayTeam: string;
  homeTeam: string;
  startsAt: string;
  cycleName: string;
  predictions: number;
  status: string;
  away: string;
  home: string;
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  locked: "En curso",
  in_progress: "En curso",
  finished: "Finalizado",
  postponed: "Pospuesto",
  cancelled: "Cancelado",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? "Estado registrado";
}

function clockLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" });
}

function digits(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 2);
  if (!clean) return "";
  return String(Math.min(SCORE_CAP, Number(clean)));
}

function zeroCount(bands: { label: string; count: number }[] | undefined, predictions: number, winners: number) {
  const band = bands?.find((item) => item.label === "0");
  return band ? band.count : Math.max(0, predictions - winners);
}

export function BaseballAdminPage() {
  const [rows, setRows] = useState<MatchBoardRow[]>([]);
  const [fallback, setFallback] = useState<BaseballMatch[]>([]);
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [tab, setTab] = useState<Bucket>("pending");
  const [team, setTeam] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [roundId, setRoundId] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const [serverNow, setServerNow] = useState("");
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"super" | "operator">("operator");
  const [menu, setMenu] = useState("");
  const awayRef = useRef<HTMLInputElement>(null);
  const homeRef = useRef<HTMLInputElement>(null);

  const round = cycles.find((cycle) => cycle.id === roundId) ?? null;
  const nowMs = serverNow ? Date.parse(serverNow) : Date.now();
  const todayKey = caracasDateKey(nowMs);

  function cycleFor(startsAt: string) {
    const key = caracasDateKey(startsAt);
    return cycles.find((cycle) => cycle.id !== "demo_cierre" && cycle.startsOn <= key && key <= cycle.endsOn) ?? null;
  }

  useEffect(() => {
    listCycles().then(setCycles).catch(() => setCycles([]));
    adminCall<{ role?: string }>("pulse_admin_whoami")
      .then((result) => setRole(result.role === "operator" ? "operator" : "super"))
      .catch(() => setRole("operator"));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailure(null);
    adminCall<BoardResponse>("pulse_admin_match_board", {
      p_status: tab,
      p_team: teamQuery,
      p_from: round?.startsOn ?? "",
      p_to: round?.endsOn ?? "",
      p_limit: 30,
      p_offset: page * 30,
    })
      .then(async (result) => {
        if (!alive) return;
        if (!result.serverNow && tab !== "cancelled") {
          const matches = await listMatches();
          if (!alive) return;
          setLegacy(true);
          setFallback(matches.filter((match) => !match.demo && !match.simulation));
          setRows([]);
          setTotal(0);
          return;
        }
        setLegacy(false);
        setFallback([]);
        setServerNow(result.serverNow ?? "");
        setTotal(result.total ?? 0);
        const next = result.matches ?? [];
        setRows((current) => {
          const merged = page === 0 ? next : [...current, ...next];
          const seen = new Set<string>();
          return merged.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
        });
      })
      .catch(async (error: unknown) => {
        if (!alive) return;
        const classified = asAdminFailure(error);
        if (classified.kind === "migration") {
          try {
            const matches = await listMatches();
            if (!alive) return;
            setLegacy(true);
            setFallback(matches.filter((match) => !match.demo && !match.simulation));
            setRows([]);
            setFailure(classified);
            return;
          } catch (reason: unknown) {
            setFailure(asAdminFailure(reason));
            return;
          }
        }
        setFailure(classified);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, teamQuery, roundId, page, round?.startsOn, round?.endsOn]);

  const visible = useMemo(() => {
    const source: MatchBoardRow[] = legacy
      ? fallback
          .filter((match) => {
            const start = Date.parse(match.startsAt);
            const key = caracasDateKey(match.startsAt);
            const teamOk = !teamQuery || `${match.homeTeam} ${match.awayTeam}`.toLowerCase().includes(teamQuery.toLowerCase());
            const roundOk = !round || (round.startsOn <= key && key <= round.endsOn);
            if (!teamOk || !roundOk) return false;
            if (tab === "cancelled") return match.status === "cancelled";
            if (tab === "settled") return match.status === "finished";
            if (match.status === "finished" || match.status === "cancelled") return false;
            if (tab === "pending") return Number.isFinite(start) && start <= nowMs && match.homeScore === null;
            return Number.isFinite(start) && start > nowMs;
          })
          .sort((a, b) => (tab === "settled" ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)))
          .slice(0, (page + 1) * 30)
          .map((match) => ({
            id: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            startsAt: match.startsAt,
            status: match.status,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            predictions: 0,
            processed: 0,
            points: 0,
            cycleName: cycleFor(match.startsAt)?.name ?? null,
          }))
      : rows;
    return source;
    // cycleFor closes over cycles, which is the dependency we need.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacy, fallback, rows, teamQuery, round, tab, nowMs, page, cycles]);

  const groups = useMemo(() => {
    const map = new Map<string, MatchBoardRow[]>();
    for (const match of visible) {
      const key = caracasDateKey(match.startsAt) || "sin-fecha";
      const list = map.get(key) ?? [];
      list.push(match);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible]);

  const hasMore = legacy ? visible.length < fallback.length && visible.length === (page + 1) * 30 : rows.length < total;

  function resetFilters(next: { tab?: Bucket; team?: string; roundId?: string }) {
    setRows([]);
    setPage(0);
    if (next.tab) setTab(next.tab);
    if (next.team !== undefined) setTeam(next.team);
    if (next.roundId !== undefined) setRoundId(next.roundId);
  }

  function openDraft(match: MatchBoardRow) {
    setPreview("");
    setDraft({
      id: match.id,
      awayTeam: match.awayTeam,
      homeTeam: match.homeTeam,
      startsAt: match.startsAt,
      cycleName: match.cycleName || cycleFor(match.startsAt)?.name || "Sin ronda",
      predictions: match.predictions,
      status: match.status,
      away: match.awayScore === null ? "" : String(match.awayScore),
      home: match.homeScore === null ? "" : String(match.homeScore),
    });
    window.setTimeout(() => awayRef.current?.focus(), 40);
  }

  useEffect(() => {
    if (!draft) {
      setPreview("");
      return;
    }
    const home = Number(draft.home);
    const away = Number(draft.away);
    if (draft.home === "" || draft.away === "" || !Number.isInteger(home) || !Number.isInteger(away)) {
      setPreview("");
      return;
    }
    if (home === away) {
      setPreview(MODAL_TIE_ERROR);
      return;
    }
    const winner = winnerFromScores(draft.homeTeam, home, draft.awayTeam, away);
    if (!winner) return;
    let alive = true;
    adminCall<{ ok?: boolean; error?: string; predictions?: number; winners?: number; points?: number; exact?: number; bands?: { label: string; count: number }[] }>("pulse_admin_preview_result", {
      p_match_id: draft.id,
      p_home_score: home,
      p_away_score: away,
    })
      .then((result) => {
        if (!alive) return;
        if (result.ok === false) {
          setPreview(result.error || "No se pudo calcular la vista previa.");
          return;
        }
        const predictions = result.predictions ?? 0;
        const winners = result.winners ?? 0;
        setPreview(`🏆 ${resultPreviewLine({
          winner: winner.name,
          winnerScore: winner.winnerScore,
          otherScore: winner.otherScore,
          predictions,
          winners,
          exact: result.exact ?? 0,
          points: result.points ?? 0,
          zeros: zeroCount(result.bands, predictions, winners),
        })}`);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const classified = asAdminFailure(error);
        if (classified.kind === "migration") {
          setPreview(previewCopy({ predictions: draft.predictions, winners: 0, exact: 0, points: 0 }));
          return;
        }
        setPreview("");
      });
    return () => {
      alive = false;
    };
  }, [draft]);

  async function confirmResult() {
    if (!draft || busy) return;
    const home = Number(draft.home);
    const away = Number(draft.away);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > SCORE_CAP || away > SCORE_CAP) {
      setFailure({ kind: "validation", message: "Escribe un marcador entero, desde cero." });
      return;
    }
    if (home === away) {
      setFailure({ kind: "validation", message: MODAL_TIE_ERROR });
      return;
    }
    const correcting = draft.status === "finished";
    if (!correcting && !canSettle(draft.startsAt, nowMs)) {
      setFailure({ kind: "validation", message: EARLY_RESULT_ERROR });
      return;
    }
    if (!window.confirm(correcting ? "Corregir este marcador y volver a liquidar los puntos?" : "Publicar este marcador y liquidar los puntos?")) return;
    setBusy(true);
    setNotice("");
    setFailure(null);
    try {
      const result = await adminCall<{ ok?: boolean; error?: string; scored?: number; points?: number }>("pulse_admin_set_result", {
        p_match_id: draft.id,
        p_home_score: home,
        p_away_score: away,
      });
      if (result.ok === false) throw new Error(result.error || "No se pudo guardar el resultado.");
      setNotice(settlementNotice(result.scored ?? 0, result.points ?? 0, correcting));
      setDraft(null);
      setPreview("");
      window.dispatchEvent(new Event("rusher-standings-refresh"));
      setRows([]);
      setPage(0);
      setTab("settled");
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function voidMatch(id: string, label: string) {
    if (!window.confirm(`Anular ${label}. Los puntos de este juego se revierten y el pronóstico queda sin efecto.`)) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await adminCall<{ ok?: boolean; error?: string }>("pulse_admin_void_match", { p_match_id: id });
      if (result.ok === false) throw new Error(result.error || "No se pudo anular el juego.");
      setNotice("Juego anulado. La tabla se volvió a calcular y los puntos de ese partido quedaron en cero.");
      window.dispatchEvent(new Event("rusher-standings-refresh"));
      setRows([]);
      setPage(0);
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMatch(match: MatchBoardRow) {
    const whenLabel = when(match.startsAt);
    if (!window.confirm(`Eliminar ${match.awayTeam} vs ${match.homeTeam} del ${whenLabel}? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await adminCall<{ ok?: boolean; error?: string }>("pulse_admin_delete_match", { p_match_id: match.id });
      if (result.ok === false) throw new Error(result.error || "No se pudo eliminar el juego.");
      setNotice("Juego eliminado.");
      setRows([]);
      setPage(0);
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(match: MatchBoardRow) {
    const value = window.prompt("Nueva fecha y hora en Caracas (AAAA-MM-DD HH:MM)");
    if (!value) return;
    const parsed = value.trim().replace(" ", "T");
    const iso = new Date(`${parsed}-04:00`);
    if (Number.isNaN(iso.getTime())) {
      setFailure({ kind: "validation", message: "Usa el formato AAAA-MM-DD HH:MM." });
      return;
    }
    setBusy(true);
    try {
      const result = await adminCall<{ ok?: boolean; error?: string }>("pulse_admin_reschedule_match", { p_match_id: match.id, p_starts_at: iso.toISOString() });
      if (result.ok === false) throw new Error(result.error || "No se pudo reprogramar.");
      setNotice("Juego reprogramado.");
      setRows([]);
      setPage(0);
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  function goToday() {
    const node = document.getElementById(`result-day-${todayKey}`);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const current = cycles.find((cycle) => cycle.id !== "demo_cierre" && cycle.startsOn <= todayKey && todayKey <= cycle.endsOn);
    if (current) resetFilters({ roundId: current.id });
  }

  const started = draft ? canSettle(draft.startsAt, nowMs) || draft.status === "finished" : false;
  const tied = draft ? draft.home !== "" && draft.away !== "" && Number(draft.home) === Number(draft.away) : false;

  return (
    <div>
      <p className="mb-4 max-w-[68ch] text-[14px] font-semibold leading-relaxed text-[var(--adm-muted)]">
        Publicar usa la liquidación que ya existe. El mismo marcador no suma puntos otra vez. Corregirlo revierte el movimiento anterior y aplica el nuevo.
      </p>
      {legacy ? (
        <p className="mb-4 rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] px-4 py-3 text-[13px] font-bold leading-relaxed">
          Falta activar la actualización de Resultados en el servidor. Mientras tanto se listan todos los partidos que la app puede leer, incluida la ronda en curso. El conteo de pronósticos llega con esa actualización.
        </p>
      ) : null}
      <Banner failure={failure} />
      {notice ? <Notice>{notice}</Notice> : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Refresh busy={loading} onClick={() => { setRows([]); setPage(0); }} />
        <button type="button" onClick={goToday} className="min-h-11 rounded-full border border-[var(--adm-line)] px-4 text-[13px] font-extrabold">Ir a hoy</button>
        {([
          ["pending", "Por cargar"],
          ["upcoming", "Próximos"],
          ["settled", "Liquidados"],
          ["cancelled", "Anulados"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => resetFilters({ tab: id })} className={`min-h-11 rounded-full px-4 text-[13px] font-extrabold ${tab === id ? "bg-[var(--adm-accent)] text-[#0B0D0F]" : "bg-[var(--adm-card)] text-[var(--adm-ink)]"}`}>
            {label}{id === tab && !legacy ? ` · ${total || visible.length}` : ""}
          </button>
        ))}
      </div>
      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); setRows([]); setPage(0); setTeamQuery(team); }}>
        <Field label="Ronda">
          <select value={roundId} onChange={(event) => resetFilters({ roundId: event.target.value })} className={inputClass}>
            <option value="">Todas las rondas</option>
            {cycles.filter((cycle) => cycle.id !== "demo_cierre").map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Equipo">
          <input value={team} onChange={(event) => setTeam(event.target.value)} className={inputClass} />
        </Field>
        <div className="sm:pt-5"><Primary type="submit">Filtrar</Primary></div>
      </form>
      {loading && rows.length === 0 && fallback.length === 0 ? <Skeleton label="Cargando partidos" /> : null}
      {!loading && visible.length === 0 ? <Empty>No hay partidos en esta pestaña.</Empty> : null}
      <div className="flex flex-col gap-4">
        {groups.map(([key, matches]) => (
          <section key={key}>
            <h3 id={`result-day-${key}`} className="sticky top-0 z-10 mb-2 bg-[var(--adm-bg,#0B0D0F)] py-2 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[var(--adm-accent)]">
              {dayHeading(matches[0]?.startsAt ?? key)} · {matches[0]?.cycleName || cycleFor(matches[0]?.startsAt ?? "")?.name || "Sin ronda"}{key === todayKey ? " · hoy" : ""}
            </h3>
            <div className="flex flex-col gap-3">
              {matches.map((match) => {
                const future = tab === "upcoming" || !canSettle(match.startsAt, nowMs);
                return (
                  <article key={match.id} className={`rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] p-4 ${future && tab !== "settled" ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[16px] font-extrabold">{match.awayTeam} vs {match.homeTeam}</p>
                      <Chip tone={match.status === "finished" ? "accent" : "amber"}>{future && tab !== "settled" ? "AÚN NO EMPIEZA" : statusLabel(match.status)}</Chip>
                    </div>
                    <p className="mt-1 text-[13px] font-semibold text-[var(--adm-muted)]">{when(match.startsAt)} · {clockLabel(match.startsAt)}</p>
                    <p className="mt-2 text-[22px] font-extrabold tabular-nums">{match.homeScore === null ? "Sin marcador" : `${match.awayScore} – ${match.homeScore}`}</p>
                    <p className="mt-1 text-[13px] text-[var(--adm-muted)]">{legacy ? "Conteo de pronósticos al activar la actualización" : `${match.predictions} pronósticos · ${match.processed} liquidados · ${match.points} puntos`}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {future && match.status !== "finished" ? null : match.status === "cancelled" ? null : (
                        <Primary onClick={() => openDraft(match)}>{match.status === "finished" ? "Corregir" : "Cargar resultado"}</Primary>
                      )}
                      {role === "super" ? (
                        <div className="relative">
                          <button type="button" aria-label={`Acciones de ${match.awayTeam} contra ${match.homeTeam}`} onClick={() => setMenu(menu === match.id ? "" : match.id)} className="min-h-12 rounded-[14px] border border-[var(--adm-line)] px-4 text-[18px] font-extrabold">⋯</button>
                          {menu === match.id ? (
                            <div className="absolute right-0 z-20 mt-1 w-52 rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] p-2">
                              {match.status !== "cancelled" ? <button type="button" className="flex min-h-11 w-full items-center px-2 text-left text-[14px] font-extrabold" onClick={() => { setMenu(""); void voidMatch(match.id, `${match.awayTeam} vs ${match.homeTeam}`); }}>Anular</button> : null}
                              <button type="button" className="flex min-h-11 w-full items-center px-2 text-left text-[14px] font-extrabold" onClick={() => { setMenu(""); void deleteMatch(match); }}>Eliminar</button>
                              {canSettle(match.startsAt, nowMs) ? null : <button type="button" className="flex min-h-11 w-full items-center px-2 text-left text-[14px] font-extrabold" onClick={() => { setMenu(""); void reschedule(match); }}>Reprogramar</button>}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {hasMore ? (
        <button type="button" onClick={() => setPage((current) => current + 1)} className="mt-4 flex h-12 w-full items-center justify-center rounded-[14px] bg-[var(--adm-accent)] text-[14px] font-extrabold text-[#0B0D0F]">
          Cargar más
        </button>
      ) : null}
      {draft ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="presentation" onClick={() => setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="result-title" className="w-full max-w-[480px] rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] text-[var(--adm-ink)]" onClick={(event) => event.stopPropagation()}>
            <h3 id="result-title" className="text-[20px] font-extrabold">{draft.status === "finished" ? "Corregir resultado" : "Cargar resultado"}</h3>
            <p className="mt-2 text-[14px] font-semibold text-[var(--adm-muted)]">
              {dayHeading(draft.startsAt)} · {clockLabel(draft.startsAt)} · {draft.cycleName} · {legacy ? "pronósticos al activar la actualización" : `${draft.predictions} pronósticos`}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-extrabold">{draft.awayTeam}</span>
                <input ref={awayRef} value={draft.away} inputMode="numeric" onChange={(event) => setDraft({ ...draft, away: digits(event.target.value) })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); homeRef.current?.focus(); } }} className={`${inputClass} h-14 w-24 text-center text-[24px] font-extrabold`} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-extrabold">{draft.homeTeam}</span>
                <input ref={homeRef} value={draft.home} inputMode="numeric" onChange={(event) => setDraft({ ...draft, home: digits(event.target.value) })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void confirmResult(); } }} className={`${inputClass} h-14 w-24 text-center text-[24px] font-extrabold`} />
              </label>
            </div>
            <p className="mt-3 text-[13px] font-semibold text-[var(--adm-muted)]">Marcador final del juego (incluye extrainnings).</p>
            {!started ? <p className="mt-3 text-[14px] font-extrabold text-[#E23B2F]">{EARLY_RESULT_ERROR}</p> : null}
            {preview ? <p className="mt-3 rounded-[12px] bg-[#101316] px-3 py-3 text-[13px] font-bold leading-relaxed text-[var(--adm-ink)]">{preview}</p> : null}
            <div className="mt-4 flex gap-2">
              <Primary disabled={busy || !started || tied} onClick={() => void confirmResult()}>{busy ? "Guardando…" : "Publicar y liquidar"}</Primary>
              <button type="button" onClick={() => setDraft(null)} className="min-h-12 rounded-[14px] border border-[var(--adm-line)] px-4 text-[14px] font-extrabold">Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
