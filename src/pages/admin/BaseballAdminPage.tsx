import { useEffect, useState } from "react";
import { Banner, Chip, Empty, Field, Notice, Primary, Refresh, Skeleton, inputClass, when } from "@/components/admin/AdminFrame";
import { settlementNotice } from "@/lib/adminConsole";
import { previewCopy } from "@/lib/adminCrm";
import { adminCall, asAdminFailure, type MatchBoardRow } from "@/services/adminConsoleApi";
import { listMatches, type BaseballMatch } from "@/services/matchesApi";
import type { AdminFailure } from "@/lib/adminConsole";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  locked: "Cerrado",
  in_progress: "En curso",
  finished: "Finalizado",
  postponed: "Pospuesto",
  cancelled: "Cancelado",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? "Estado registrado";
}

export function BaseballAdminPage() {
  const [rows, setRows] = useState<MatchBoardRow[]>([]);
  const [fallback, setFallback] = useState<BaseballMatch[]>([]);
  const [tab, setTab] = useState<"pending" | "live" | "done">("pending");
  const [team, setTeam] = useState("");
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ id: string; label: string; home: string; away: string; correcting: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function load(nextTab = tab) {
    setLoading(true);
    setFailure(null);
    const status = nextTab === "done" ? "finished" : nextTab === "live" ? "in_progress" : "";
    adminCall<{ ok: boolean; matches: MatchBoardRow[] }>("pulse_admin_match_board", {
      p_status: status,
      p_team: team,
      p_from: "",
      p_to: "",
      p_limit: 40,
      p_offset: 0,
    })
      .then((result) => {
        setRows(result.matches ?? []);
        setFallback([]);
      })
      .catch(async (error: unknown) => {
        const classified = asAdminFailure(error);
        if (classified.kind === "migration") {
          try {
            const matches = await listMatches();
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
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function confirmResult() {
    if (!draft) return;
    const home = Number(draft.home);
    const away = Number(draft.away);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      setFailure({ kind: "validation", message: "Escribe un marcador entero, desde cero." });
      return;
    }
    if (home === away) {
      setFailure({ kind: "validation", message: "El resultado no puede quedar empatado." });
      return;
    }
    setBusy(true);
    setNotice("");
    setFailure(null);
    try {
      let line = "Se publicará el marcador con la liquidación que ya usa Rusher.";
      try {
        const preview = await adminCall<{ ok?: boolean; error?: string; winners?: number; points?: number; exact?: number }>("pulse_admin_preview_result", {
          p_match_id: draft.id,
          p_home_score: home,
          p_away_score: away,
        });
        if (preview.ok === false) throw new Error(preview.error || "No se pudo calcular la vista previa.");
        line = previewCopy(preview.winners ?? 0, preview.points ?? 0, preview.exact ?? 0);
      } catch (error: unknown) {
        const classified = asAdminFailure(error);
        if (classified.kind !== "migration") throw error;
      }
      const question = draft.correcting ? `Corregir marcador. ${line}` : `Publicar y liquidar. ${line}`;
      if (!window.confirm(question)) {
        setBusy(false);
        return;
      }
      const result = await adminCall<{ ok?: boolean; error?: string; scored?: number; points?: number }>("pulse_admin_set_result", {
        p_match_id: draft.id,
        p_home_score: home,
        p_away_score: away,
      });
      if (result.ok === false) throw new Error(result.error || "No se pudo guardar el resultado.");
      setNotice(settlementNotice(result.scored ?? 0, result.points ?? 0, draft.correcting));
      setDraft(null);
      load();
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  function inTab(status: string, homeScore: number | null) {
    if (tab === "live") return status === "in_progress";
    if (tab === "done") return status === "finished";
    return status !== "finished" && status !== "cancelled" && homeScore === null;
  }

  const visible = rows.filter((row) => {
    const teamOk = !team || `${row.homeTeam} ${row.awayTeam}`.toLowerCase().includes(team.toLowerCase());
    return teamOk && inTab(row.status, row.homeScore);
  });
  const fallbackVisible = fallback.filter((row) => {
    const teamOk = !team || `${row.homeTeam} ${row.awayTeam}`.toLowerCase().includes(team.toLowerCase());
    return teamOk && inTab(row.status, row.homeScore);
  });

  return (
    <div>
      <p className="mb-4 max-w-[68ch] text-[14px] font-semibold leading-relaxed text-[var(--adm-muted)]">
        Publicar usa la liquidación que ya existe. El mismo marcador no suma puntos otra vez. Corregirlo revierte el movimiento anterior y aplica el nuevo.
      </p>
      <Banner failure={failure} />
      {notice ? <Notice>{notice}</Notice> : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Refresh busy={loading} onClick={() => load(tab)} />
        {([
          ["pending", "Por cargar"],
          ["live", "En juego"],
          ["done", "Liquidados"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-11 rounded-full px-4 text-[13px] font-extrabold ${tab === id ? "bg-[var(--adm-accent)] text-[#0B0D0F]" : "bg-[var(--adm-card)] text-[var(--adm-ink)]"}`}>{label}</button>
        ))}
      </div>
      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <Field label="Equipo">
          <input value={team} onChange={(event) => setTeam(event.target.value)} className={inputClass} />
        </Field>
        <div className="sm:pt-5"><Primary type="submit">Filtrar</Primary></div>
      </form>
      {loading ? <Skeleton label="Cargando partidos" /> : null}
      {!loading && visible.length === 0 && fallbackVisible.length === 0 ? <Empty>No hay partidos en esta pestaña.</Empty> : null}
      <div className="flex flex-col gap-3">
        {visible.map((match) => (
          <article key={match.id} className="rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[16px] font-extrabold">{match.awayTeam} vs {match.homeTeam}</p>
              <Chip tone={match.status === "finished" ? "accent" : match.status === "in_progress" ? "cyan" : "amber"}>{statusLabel(match.status)}</Chip>
            </div>
            <p className="mt-1 text-[13px] font-semibold text-[var(--adm-muted)]">{when(match.startsAt)}</p>
            <p className="mt-2 text-[22px] font-extrabold tabular-nums">{match.homeScore === null ? "Sin marcador" : `${match.awayScore} – ${match.homeScore}`}</p>
            <p className="mt-1 text-[13px] text-[var(--adm-muted)]">{match.predictions} pronósticos · {match.processed} liquidados · {match.points} puntos</p>
            <div className="mt-3">
              <Primary onClick={() => setDraft({ id: match.id, label: `${match.awayTeam} vs ${match.homeTeam}`, home: String(match.homeScore ?? ""), away: String(match.awayScore ?? ""), correcting: match.status === "finished" })}>
                {match.status === "finished" ? "Corregir marcador" : "Publicar y liquidar"}
              </Primary>
            </div>
          </article>
        ))}
        {rows.length === 0 && fallbackVisible.map((match) => (
          <article key={match.id} className="rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] p-4">
            <p className="text-[16px] font-extrabold">{match.awayTeam} vs {match.homeTeam}</p>
            <p className="mt-1 text-[13px] font-semibold text-[var(--adm-muted)]">{when(match.startsAt)} · {statusLabel(match.status)}</p>
            <div className="mt-3">
              <Primary onClick={() => setDraft({ id: match.id, label: `${match.awayTeam} vs ${match.homeTeam}`, home: String(match.homeScore ?? ""), away: String(match.awayScore ?? ""), correcting: match.status === "finished" })}>
                {match.status === "finished" ? "Corregir marcador" : "Publicar y liquidar"}
              </Primary>
            </div>
          </article>
        ))}
      </div>
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="result-title" className="w-full max-w-[480px] rounded-[14px] border border-[var(--adm-line)] bg-[var(--adm-card)] p-5 text-[var(--adm-ink)]">
            <h3 id="result-title" className="text-[20px] font-extrabold">{draft.correcting ? "Corregir marcador" : "Publicar y liquidar"}</h3>
            <p className="mt-2 text-[14px] font-semibold text-[var(--adm-muted)]">{draft.label}</p>
            <p className="mt-2 text-[13px] font-semibold text-[var(--adm-muted)]">Visitante y luego local. La vista previa usa la misma fórmula de puntos. Confirmar guarda marcador, puntos y movimientos en una sola transacción.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Visitante">
                <input value={draft.away} onChange={(event) => setDraft({ ...draft, away: event.target.value })} inputMode="numeric" className={inputClass} />
              </Field>
              <Field label="Local">
                <input value={draft.home} onChange={(event) => setDraft({ ...draft, home: event.target.value })} inputMode="numeric" className={inputClass} />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <Primary disabled={busy} onClick={() => void confirmResult()}>{busy ? "Guardando…" : draft.correcting ? "Corregir" : "Publicar y liquidar"}</Primary>
              <button type="button" onClick={() => setDraft(null)} className="min-h-12 rounded-[14px] border border-[var(--adm-line)] px-4 text-[14px] font-extrabold">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
