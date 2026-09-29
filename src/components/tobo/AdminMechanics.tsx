import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { BaseballMatch } from "@/services/matchesApi";
import {
  activateFlash,
  activateLive,
  adminVenues,
  closeBingo,
  closeLive,
  createFlash,
  createLive,
  listFlashAdmin,
  listLiveAdmin,
  matchBoard,
  mechanicsSummary,
  resolveFlash,
  resolveLive,
  rotateQr,
  saveVenueDetails,
  voidFlash,
  voidLive,
  type AdminVenue,
  type BingoEvent,
  type FlashQuestion,
  type LiveQuestion,
} from "@/services/mechanicsApi";

export function AdminMechanics({
  adminKey,
  matches,
  onDone,
  onFail,
}: {
  adminKey: string;
  matches: BaseballMatch[];
  onDone: (message: string) => void;
  onFail: (message: string) => void;
}) {
  const ready = adminKey.trim().length > 0;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <QrAdmin adminKey={adminKey} ready={ready} onDone={onDone} onFail={onFail} />
      <LiveAdmin adminKey={adminKey} ready={ready} matches={matches} onDone={onDone} onFail={onFail} />
      <BingoAdmin adminKey={adminKey} ready={ready} matches={matches} onDone={onDone} onFail={onFail} />
      <FlashAdmin adminKey={adminKey} ready={ready} onDone={onDone} onFail={onFail} />
      <SummaryAdmin adminKey={adminKey} ready={ready} onFail={onFail} />
    </div>
  );
}

function QrPoster({ token }: { token: string }) {
  const [image, setImage] = useState("");
  const url = `${window.location.origin}/q/${token}`;
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 640, margin: 1 }).then((value) => {
      if (alive) setImage(value);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url]);
  if (!image) return null;
  return (
    <div className="mt-3 rounded-2xl bg-[#FFF7F1] p-3 text-center">
      <img src={image} alt="Código QR de la tasca" className="mx-auto w-full max-w-[280px]" />
      <p className="mt-2 break-all text-[12px] font-bold">{url}</p>
    </div>
  );
}

function QrAdmin({ adminKey, ready, onDone, onFail }: { adminKey: string; ready: boolean; onDone: (message: string) => void; onFail: (message: string) => void }) {
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    if (!ready) return;
    setVenues(await adminVenues(adminKey.trim()));
  }

  useEffect(() => {
    load().catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudieron cargar las tascas."));
  }, [adminKey]);

  function draft(venue: AdminVenue) {
    return notes[venue.id] ?? JSON.stringify({
      zone: venue.zone,
      address: venue.address,
      instagram: venue.instagram,
      whatsapp: venue.whatsapp,
      prize: venue.roundPrize,
    });
  }

  async function download(venue: AdminVenue) {
    const url = `${window.location.origin}/q/${venue.qrToken}`;
    const image = await QRCode.toDataURL(url, { width: 640, margin: 1 });
    const link = document.createElement("a");
    link.href = image;
    link.download = `${venue.name}.png`;
    link.click();
  }

  return (
    <details className="rounded-[24px] bg-white px-4 py-4" open>
      <summary className="text-[16px] font-extrabold">QR de tascas</summary>
      {venues.length === 0 && <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Publica una tasca para generar su QR.</p>}
      {venues.map((venue) => {
        const fields = (() => {
          try {
            return JSON.parse(draft(venue)) as { zone: string; address: string; instagram: string; whatsapp: string; prize: string };
          } catch {
            return { zone: venue.zone, address: venue.address, instagram: venue.instagram, whatsapp: venue.whatsapp, prize: venue.roundPrize };
          }
        })();
        return (
          <div key={venue.id} className="mt-3 border-t border-[#F3E4D8] pt-3">
            <p className="text-[15px] font-extrabold">{venue.name}</p>
            <QrPoster token={venue.qrToken} />
            {([
              ["zone", "Zona"],
              ["address", "Dirección"],
              ["instagram", "Instagram"],
              ["whatsapp", "WhatsApp"],
              ["prize", "Premio de la ronda"],
            ] as const).map(([field, label]) => (
              <input
                key={field}
                value={fields[field] || ""}
                aria-label={label}
                placeholder={label}
                onChange={(event) => setNotes({ ...notes, [venue.id]: JSON.stringify({ ...fields, [field]: event.target.value }) })}
                className="mt-2 h-11 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-bold outline-none"
              />
            ))}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => void saveVenueDetails({ adminKey: adminKey.trim(), venueId: venue.id, zone: fields.zone, address: fields.address, instagram: fields.instagram, whatsapp: fields.whatsapp, prize: fields.prize }).then(() => onDone("Ficha guardada.")).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo guardar."))} className="h-10 rounded-2xl bg-[#241710] text-[12px] font-extrabold text-white">Guardar</button>
              <button type="button" onClick={() => void download(venue)} className="h-10 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Descargar QR</button>
              <button type="button" onClick={() => void rotateQr(adminKey.trim(), venue.id).then(() => load()).then(() => onDone("QR nuevo. Descarga otra vez el cartel.")).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo renovar."))} className="h-10 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Renovar</button>
            </div>
          </div>
        );
      })}
    </details>
  );
}

function LiveAdmin({ adminKey, ready, matches, onDone, onFail }: { adminKey: string; ready: boolean; matches: BaseballMatch[]; onDone: (message: string) => void; onFail: (message: string) => void }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [inning, setInning] = useState("1");
  const [prompt, setPrompt] = useState("");
  const [labels, setLabels] = useState("Sí\nNo");
  const [rows, setRows] = useState<LiveQuestion[]>([]);

  async function load() {
    if (!ready) return;
    setRows(await listLiveAdmin(adminKey.trim()));
  }
  useEffect(() => { load().catch(() => undefined); }, [adminKey]);

  async function create(kind: string) {
    try {
      await createLive({
        adminKey: adminKey.trim(),
        matchId,
        kind,
        inning: Number(inning),
        prompt,
        labels: labels.split("\n").map((line) => line.trim()).filter(Boolean),
      });
      onDone("Pregunta en vivo publicada.");
      await load();
    } catch (reason: unknown) {
      onFail(reason instanceof Error ? reason.message : "No se pudo publicar.");
    }
  }

  return (
    <details className="rounded-[24px] bg-white px-4 py-4">
      <summary className="text-[16px] font-extrabold">Pregunta en vivo</summary>
      <select value={matchId} onChange={(event) => setMatchId(event.target.value)} className="mt-3 h-11 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[13px] font-bold">
        {matches.map((match) => <option key={match.id} value={match.id}>{match.awayTeam} en {match.homeTeam}</option>)}
      </select>
      <input value={inning} onChange={(event) => setInning(event.target.value)} inputMode="numeric" aria-label="Inning" className="mt-2 h-11 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-bold outline-none" />
      <div className="mt-2 grid grid-cols-1 gap-2">
        <button type="button" onClick={() => void create("runs")} className="h-11 rounded-2xl bg-[#FF4F1A] text-[13px] font-extrabold text-white">¿Anotan en el inning?</button>
        <button type="button" onClick={() => void create("homer")} className="h-11 rounded-2xl bg-[#FF4F1A] text-[13px] font-extrabold text-white">¿Hay jonrón?</button>
        <button type="button" onClick={() => void create("first")} className="h-11 rounded-2xl bg-[#FF4F1A] text-[13px] font-extrabold text-white">¿Quién anota primero?</button>
      </div>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Pregunta libre" className="mt-2 h-16 w-full rounded-2xl bg-[#FFF7F1] px-3 py-2 text-[14px] font-bold outline-none" />
      <textarea value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="Una opción por línea" className="mt-2 h-20 w-full rounded-2xl bg-[#FFF7F1] px-3 py-2 text-[14px] font-bold outline-none" />
      <button type="button" onClick={() => void create("free")} className="mt-2 h-11 w-full rounded-2xl bg-[#241710] text-[13px] font-extrabold text-white">Publicar pregunta libre</button>
      {rows.map((question) => (
        <div key={question.id} className="mt-3 border-t border-[#F3E4D8] pt-3">
          <p className="text-[14px] font-extrabold">{question.prompt}</p>
          <p className="text-[12px] font-bold text-[#A08B80]">{question.status} · {question.answers ?? 0} respuestas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {question.status === "draft" && <button type="button" onClick={() => void activateLive(adminKey.trim(), question.id).then(load).then(() => onDone("Pregunta en vivo activada."))} className="h-9 rounded-2xl bg-[#FF4F1A] px-3 text-[12px] font-extrabold text-white">Activar</button>}
            {question.status === "open" && <button type="button" onClick={() => void closeLive(adminKey.trim(), question.id).then(load)} className="h-9 rounded-2xl bg-[#FFF1EA] px-3 text-[12px] font-extrabold text-[#FF4F1A]">Cerrar</button>}
            {question.status !== "draft" && question.options.map((option) => (
              <button key={option.id} type="button" onClick={() => void resolveLive(adminKey.trim(), question.id, option.id).then(() => onDone("Resuelta.")).then(load).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo resolver."))} className="h-9 rounded-2xl bg-[#241710] px-3 text-[12px] font-extrabold text-white">{option.label}</button>
            ))}
            <button type="button" onClick={() => void voidLive(adminKey.trim(), question.id).then(load)} className="h-9 rounded-2xl px-3 text-[12px] font-extrabold text-[#E23B2F]">Anular</button>
          </div>
        </div>
      ))}
    </details>
  );
}

function BingoAdmin({ adminKey, ready, matches, onDone, onFail }: { adminKey: string; ready: boolean; matches: BaseballMatch[]; onDone: (message: string) => void; onFail: (message: string) => void }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [catalog, setCatalog] = useState<BingoEvent[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!matchId) return;
    matchBoard(matchId).then((board) => setCatalog(board.bingo.catalog ?? [])).catch(() => undefined);
  }, [matchId]);

  return (
    <details className="rounded-[24px] bg-white px-4 py-4">
      <summary className="text-[16px] font-extrabold">Cerrar bingo</summary>
      <select value={matchId} onChange={(event) => { setMatchId(event.target.value); setPicked([]); }} className="mt-3 h-11 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[13px] font-bold">
        {matches.map((match) => <option key={match.id} value={match.id}>{match.awayTeam} en {match.homeTeam}</option>)}
      </select>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {catalog.map((event) => (
          <button key={event.id} type="button" onClick={() => setPicked((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} className={`min-h-11 rounded-2xl px-2 py-2 text-[12px] font-extrabold ${picked.includes(event.id) ? "bg-[#FF4F1A] text-white" : "bg-[#FFF1EA]"}`}>
            {event.label}
          </button>
        ))}
      </div>
      <button type="button" disabled={!ready} onClick={() => void closeBingo(adminKey.trim(), matchId, picked).then((result) => onDone(result.void ? "Bingo anulado: el juego está cancelado." : "Bingo cerrado y puntos calculados.")).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo cerrar."))} className="mt-3 h-11 w-full rounded-2xl bg-[#241710] text-[13px] font-extrabold text-white disabled:opacity-40">
        Cerrar bingo
      </button>
    </details>
  );
}

function FlashAdmin({ adminKey, ready, onDone, onFail }: { adminKey: string; ready: boolean; onDone: (message: string) => void; onFail: (message: string) => void }) {
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [labels, setLabels] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [rows, setRows] = useState<FlashQuestion[]>([]);

  async function load() {
    if (!ready) return;
    const [place, questions] = await Promise.all([adminVenues(adminKey.trim()), listFlashAdmin(adminKey.trim())]);
    setVenues(place);
    setRows(questions);
  }
  useEffect(() => { load().catch(() => undefined); }, [adminKey]);

  return (
    <details className="rounded-[24px] bg-white px-4 py-4">
      <summary className="text-[16px] font-extrabold">Pregunta relámpago</summary>
      <select value={venueId} onChange={(event) => setVenueId(event.target.value)} className="mt-3 h-11 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[13px] font-bold">
        <option value="">Todas las tascas</option>
        {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
      </select>
      <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Pregunta" className="mt-2 h-11 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-bold outline-none" />
      <textarea value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="Opciones, una por línea" className="mt-2 h-20 w-full rounded-2xl bg-[#FFF7F1] px-3 py-2 text-[14px] font-bold outline-none" />
      <input value={minutes} onChange={(event) => setMinutes(event.target.value)} inputMode="numeric" aria-label="Minutos" className="mt-2 h-11 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-bold outline-none" />
      <button type="button" disabled={!ready} onClick={() => void createFlash({ adminKey: adminKey.trim(), venueId, prompt, labels: labels.split("\n").map((line) => line.trim()).filter(Boolean), minutes: Number(minutes) }).then(() => onDone("Relámpago activo.")).then(load).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo crear."))} className="mt-2 h-11 w-full rounded-2xl bg-[#FF4F1A] text-[13px] font-extrabold text-white disabled:opacity-40">
        Activar ahora
      </button>
      {rows.map((question) => (
        <div key={question.id} className="mt-3 border-t border-[#F3E4D8] pt-3">
          <p className="text-[14px] font-extrabold">{question.prompt}</p>
          <p className="text-[12px] font-bold text-[#A08B80]">{question.status} · {question.total} respuestas</p>
          {question.byVenue.map((row) => <p key={`${question.id}-${row.venue}`} className="text-[12px] font-semibold">{row.venue || "Sin tasca"}: {row.count}</p>)}
          <div className="mt-2 flex flex-wrap gap-2">
            {question.status === "draft" && <button type="button" onClick={() => void activateFlash(adminKey.trim(), question.id).then(load).then(() => onDone("Relámpago activo por 5 minutos."))} className="h-9 rounded-2xl bg-[#FF4F1A] px-3 text-[12px] font-extrabold text-white">Activar</button>}
            {question.status !== "draft" && question.options.map((option) => (
              <button key={option.id} type="button" onClick={() => void resolveFlash(adminKey.trim(), question.id, option.id).then(load).then(() => onDone("Relámpago resuelto."))} className="h-9 rounded-2xl bg-[#241710] px-3 text-[12px] font-extrabold text-white">{option.label}</button>
            ))}
            <button type="button" onClick={() => void voidFlash(adminKey.trim(), question.id).then(load)} className="h-9 text-[12px] font-extrabold text-[#E23B2F]">Anular</button>
          </div>
        </div>
      ))}
    </details>
  );
}

function SummaryAdmin({ adminKey, ready, onFail }: { adminKey: string; ready: boolean; onFail: (message: string) => void }) {
  const [events, setEvents] = useState<{ type: string; count: number }[]>([]);
  const [scans, setScans] = useState<{ venue: string; count: number }[]>([]);
  useEffect(() => {
    if (!ready) return;
    mechanicsSummary(adminKey.trim()).then((summary) => {
      setEvents(summary.events ?? []);
      setScans(summary.scans ?? []);
    }).catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "No se pudo cargar el resumen."));
  }, [adminKey, ready]);
  const names: Record<string, string> = {
    live_question_answered: "Preguntas en vivo",
    bingo_saved: "Bingos guardados",
    bingo_resolved: "Bingos cerrados",
    pleno_awarded: "Plenos",
    streak_milestone: "Hitos de racha",
    qr_scan_credited: "Visitas QR",
    flash_answered: "Relámpagos",
  };
  return (
    <details className="rounded-[24px] bg-white px-4 py-4">
      <summary className="text-[16px] font-extrabold">Resumen del piloto</summary>
      {events.map((event) => <p key={event.type} className="mt-2 text-[14px] font-bold">{names[event.type] ?? event.type}: {event.count}</p>)}
      {scans.map((scan) => <p key={scan.venue} className="mt-1 text-[13px] font-semibold text-[#8D7366]">{scan.venue}: {scan.count} escaneos</p>)}
      {events.length === 0 && scans.length === 0 && <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Todavía no hay participación registrada.</p>}
    </details>
  );
}
