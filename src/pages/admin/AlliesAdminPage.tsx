import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Banner, Chip, Empty, Field, Metric, Notice, Panel, Primary, Skeleton, inputClass } from "@/components/admin/AdminFrame";
import { adminCall, asAdminFailure, type AllyCampaign, type AllyVenue } from "@/services/adminConsoleApi";
import type { AdminFailure } from "@/lib/adminConsole";

export function AlliesAdminPage() {
  const [venues, setVenues] = useState<AllyVenue[]>([]);
  const [campaigns, setCampaigns] = useState<AllyCampaign[]>([]);
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [venueId, setVenueId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [points, setPoints] = useState("20");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    adminCall<{ ok: boolean; venues: AllyVenue[]; campaigns: AllyCampaign[] }>("pulse_admin_allies")
      .then(async (result) => {
        setVenues(result.venues ?? []);
        setCampaigns(result.campaigns ?? []);
        setFailure(null);
        const images: Record<string, string> = {};
        await Promise.all((result.campaigns ?? []).map(async (campaign) => {
          const url = `${window.location.origin}/aliado/${campaign.code}`;
          images[campaign.id] = await QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: "#0B0D0F", light: "#F4F1EA" } });
        }));
        setQr(images);
      })
      .catch((error: unknown) => setFailure(asAdminFailure(error)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function saveVenue(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const result = await adminCall<{ ok: boolean; error?: string }>("pulse_admin_save_ally", {
        p_venue_id: "",
        p_name: name,
        p_zone: zone,
        p_city: city,
        p_active: true,
      });
      if (!result.ok) throw new Error(result.error || "No se pudo guardar el local.");
      setName("");
      setZone("");
      setCity("");
      setNotice("Local guardado.");
      load();
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    const amount = Number(points);
    if (!venueId) {
      setFailure({ kind: "validation", message: "Elige el local de la campaña." });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
      setFailure({ kind: "validation", message: "Los puntos deben ser un entero entre 1 y 500." });
      return;
    }
    setBusy(true);
    try {
      const result = await adminCall<{ ok: boolean; error?: string; code?: string }>("pulse_admin_save_campaign", {
        p_campaign_id: "",
        p_venue_id: venueId,
        p_name: campaignName,
        p_points: amount,
        p_active: true,
      });
      if (!result.ok) throw new Error(result.error || "No se pudo crear la campaña.");
      setCampaignName("");
      setNotice(result.code ? `Campaña lista. Enlace: ${window.location.origin}/aliado/${result.code}` : "Campaña guardada.");
      load();
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(campaign: AllyCampaign) {
    setBusy(true);
    try {
      const result = await adminCall<{ ok: boolean; error?: string }>("pulse_admin_save_campaign", {
        p_campaign_id: campaign.id,
        p_venue_id: campaign.venueId,
        p_name: campaign.name,
        p_points: campaign.points,
        p_active: !campaign.active,
      });
      if (!result.ok) throw new Error(result.error || "No se pudo actualizar la campaña.");
      load();
    } catch (error: unknown) {
      setFailure(asAdminFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-[28px] font-extrabold tracking-tight">Aliados y QR</h2>
      <p className="mb-4 text-[14px] font-semibold text-[var(--adm-muted)]">El QR abre un enlace de Rusher. El servidor acredita los puntos una sola vez por usuario y campaña.</p>
      <Banner failure={failure} />
      {notice && <Notice>{notice}</Notice>}
      {loading ? <Skeleton label="Cargando aliados" /> : (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric label="Locales activos" value={String(venues.filter((venue) => venue.active).length)} note="Marcados como activos." tone="accent" />
          <Metric label="Visitas por QR" value={String(venues.reduce((sum, venue) => sum + venue.scans, 0))} note="Escaneos registrados." tone="cyan" />
          <Metric label="Recompensas QR" value={String(venues.reduce((sum, venue) => sum + venue.qrRewards, 0))} note="Movimientos de visita ya acreditados." tone="amber" />
          <Metric label="Campañas activas" value={String(campaigns.filter((campaign) => campaign.active).length)} note={`${campaigns.reduce((sum, campaign) => sum + campaign.rewards, 0)} recompensas de campaña.`} tone="violet" />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Nuevo local">
          <form onSubmit={saveVenue} className="flex flex-col gap-3">
            <Field label="Nombre"><input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required /></Field>
            <Field label="Zona"><input value={zone} onChange={(event) => setZone(event.target.value)} className={inputClass} /></Field>
            <Field label="Ciudad"><input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} /></Field>
            <Primary type="submit" disabled={busy}>Guardar local</Primary>
          </form>
        </Panel>
        <Panel title="Nueva campaña">
          <form onSubmit={saveCampaign} className="flex flex-col gap-3">
            <Field label="Local">
              <select value={venueId} onChange={(event) => setVenueId(event.target.value)} className={inputClass}>
                <option value="">Elegir</option>
                {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </select>
            </Field>
            <Field label="Nombre"><input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} className={inputClass} required /></Field>
            <Field label="Puntos"><input value={points} onChange={(event) => setPoints(event.target.value)} inputMode="numeric" className={inputClass} /></Field>
            <Primary type="submit" disabled={busy}>Crear campaña</Primary>
          </form>
        </Panel>
      </div>
      <Panel title="Locales">
        {venues.length === 0 ? <Empty>No hay locales para mostrar.</Empty> : null}
        <ul className="flex flex-col gap-2">
          {[...venues].sort((left, right) => right.scans - left.scans).map((venue) => (
            <li key={venue.id} className="rounded-[14px] bg-[#0B0D0F] px-3 py-3 text-[13px]">
              <p className="font-extrabold">{venue.name} <Chip tone={venue.active ? "accent" : "pink"}>{venue.active ? "Activo" : "Inactivo"}</Chip></p>
              <p className="text-[var(--adm-muted)]">{venue.zone} {venue.city} · {venue.scans} visitas · {venue.qrRewards} recompensas</p>
              <button type="button" disabled={busy} onClick={() => void adminCall("pulse_admin_save_ally", { p_venue_id: venue.id, p_name: venue.name, p_zone: venue.zone, p_city: venue.city, p_active: !venue.active }).then(() => load()).catch((error: unknown) => setFailure(asAdminFailure(error)))} className="mt-2 min-h-11 font-extrabold text-[var(--adm-accent)]">{venue.active ? "Pausar" : "Activar"}</button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Campañas">
        {campaigns.length === 0 ? <Empty>Todavía no hay campañas.</Empty> : null}
        <ul className="flex flex-col gap-2">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="rounded-2xl bg-[#0B0D0F] px-3 py-3 text-[13px]">
              <p className="font-extrabold">{campaign.name} · {campaign.points} pts · <Chip tone={campaign.active ? "violet" : "pink"}>{campaign.active ? "Activa" : "Inactiva"}</Chip></p>
              <p className="text-[var(--adm-muted)]">{campaign.venue} · {campaign.opens} aperturas · {campaign.rewards} recompensas · {campaign.newAccounts} cuentas nuevas</p>
              <p className="mt-1 break-all font-bold">{window.location.origin}/aliado/{campaign.code}</p>
              {qr[campaign.id] ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <img src={qr[campaign.id]} alt={`Código QR de ${campaign.name}`} className="h-28 w-28 rounded-xl bg-[#F4F1EA] p-1" />
                  <a href={qr[campaign.id]} download={`rusher-${campaign.code}.png`} className="min-h-11 font-extrabold text-[var(--adm-accent)]">Descargar QR</a>
                </div>
              ) : null}
              <button type="button" disabled={busy} onClick={() => void toggle(campaign)} className="mt-2 min-h-11 font-extrabold text-[var(--adm-accent)]">
                {campaign.active ? "Desactivar" : "Activar"}
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
