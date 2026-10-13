import { useEffect, useState } from "react";
import { GhostCta, GoldCta } from "@/components/tobo/surface";
import { leagueInviteLink, pickLeagueShareText, shareLeagueInvite } from "@/config/leagues";
import {
  inviteLeagueAlias,
  myLeagueInvites,
  respondLeagueInvite,
  searchLeagueInvitees,
  type League,
} from "@/services/leaguesApi";

function friendly(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : "";
  if (message && !/[A-Z_]{4,}|SQL|column/i.test(message)) return message;
  console.error("liga", reason);
  return fallback;
}

export function LeagueShareBar({
  league,
  alias,
  onInvite,
}: {
  league: League;
  alias: string;
  onInvite: () => void;
}) {
  const [note, setNote] = useState("");

  async function share() {
    const text = pickLeagueShareText({
      alias,
      liga: league.name,
      codigo: league.code,
      enlace: leagueInviteLink(league.code),
    });
    const result = await shareLeagueInvite(text);
    setNote(result === "copied" ? "Mensaje copiado." : result === "failed" ? "No se pudo compartir. Copia el código a mano." : "");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(league.code);
      setNote("Código copiado.");
    } catch (reason: unknown) {
      console.error("liga", reason);
      setNote("No se pudo copiar. Anota el código a mano.");
    }
  }

  return (
    <div>
      <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Código de invitación</p>
      <p className="mt-2 text-[28px] font-extrabold uppercase tracking-[0.18em]">{league.code}</p>
      <div className="mt-3 flex flex-col gap-2">
        <GoldCta onClick={() => void share()}>Compartir</GoldCta>
        <div className="grid grid-cols-2 gap-2">
          <GhostCta onClick={() => void copy()}>Copiar código</GhostCta>
          <GhostCta onClick={onInvite}>+ Invitar por alias</GhostCta>
        </div>
      </div>
      {note && <p className="mt-2 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{note}</p>}
    </div>
  );
}

export function LeagueInviteSheet({ leagueId, onClose }: { leagueId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (query.trim().length < 3) {
      setAliases([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      searchLeagueInvitees(leagueId, query.trim())
        .then(setAliases)
        .catch((reason: unknown) => setNote(friendly(reason, "No se pudo buscar.")));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [leagueId, query]);

  async function invite(alias: string) {
    setBusy(alias);
    setNote("");
    try {
      await inviteLeagueAlias(leagueId, alias);
      setAliases((rows) => rows.filter((row) => row !== alias));
      setNote(`Invitación enviada a ${alias}.`);
    } catch (reason: unknown) {
      setNote(friendly(reason, "No se pudo enviar la invitación."));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: "rgba(0,0,0,0.62)" }}>
      <section className="w-full rounded-t-[28px] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
        <p className="text-[16px] font-extrabold">Invitar por alias</p>
        <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Escribe al menos 3 letras. Solo verás alias.</p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="vicente0"
          className="mt-3 h-12 w-full rounded-[14px] px-4 text-[15px] font-extrabold outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--t-text)", border: "1px solid var(--t-border)" }}
        />
        <div className="mt-3 flex flex-col gap-2">
          {aliases.map((alias) => (
            <button
              key={alias}
              type="button"
              disabled={busy === alias}
              onClick={() => void invite(alias)}
              className="flex min-h-12 items-center justify-between rounded-2xl px-3 text-[14px] font-extrabold"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid var(--t-border)" }}
            >
              <span>{alias}</span>
              <span style={{ color: "var(--t-accent)" }}>{busy === alias ? "…" : "Invitar"}</span>
            </button>
          ))}
        </div>
        {note && <p className="mt-3 text-[13px] font-bold">{note}</p>}
        <div className="mt-4">
          <GhostCta onClick={onClose}>Cerrar</GhostCta>
        </div>
      </section>
    </div>
  );
}

export function LeagueInviteInbox() {
  const [items, setItems] = useState<{ id: string; league: string; from: string }[]>([]);
  const [note, setNote] = useState("");

  function refresh() {
    myLeagueInvites()
      .then(setItems)
      .catch((reason: unknown) => {
        console.error("liga", reason);
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function respond(id: string, accept: boolean) {
    try {
      await respondLeagueInvite(id, accept);
      setItems((rows) => rows.filter((row) => row.id !== id));
      setNote(accept ? "Te uniste a la liga." : "Invitación rechazada.");
    } catch (reason: unknown) {
      setNote(friendly(reason, "No se pudo responder."));
    }
  }

  if (items.length === 0 && !note) return null;

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl px-4 py-3" style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <p className="text-[14px] font-extrabold">{item.from} te invita a {item.league}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <GoldCta onClick={() => void respond(item.id, true)}>Aceptar</GoldCta>
            <GhostCta onClick={() => void respond(item.id, false)}>Rechazar</GhostCta>
          </div>
        </div>
      ))}
      {note && <p className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{note}</p>}
    </div>
  );
}
