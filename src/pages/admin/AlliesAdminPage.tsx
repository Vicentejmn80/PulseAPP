import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Banner, Chip, Empty, Field, Metric, Notice, Panel, Primary, Skeleton, inputClass } from "@/components/admin/AdminFrame";
import { instagramLink, whatsappDigits } from "@/lib/allyContact";
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
  const [editingId, setEditingId] = useState("");
  const [category, setCategory] = useState("");
  const [benefit, setBenefit] = useState("");
  const [instagram, setInstagram] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [rif, setRif] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [active, setActive] = useState(true);
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
      if (whatsapp.trim() && !whatsappDigits(whatsapp)) {
        setFailure({ kind: "validation", message: "El WhatsApp necesita el código de país, por ejemplo +58 424 000 0000." });
        setBusy(false);
        return;
      }
      if (instagram.trim() && !instagramLink(instagram)) {
        setFailure({ kind: "validation", message: "Instagram acepta @usuario o una URL." });
        setBusy(false);
        return;
      }
      const result = await adminCall<{ ok: boolean; error?: string }>("pulse_admin_save_ally", {
        p_venue_id: editingId,
        p_name: name,
        p_zone: zone,
        p_city: city,
        p_active: active,
        p_category: category,
        p_benefit: benefit,
        p_instagram: instagram,
        p_whatsapp: whatsapp,
        p_address: address,
        p_maps_url: mapsUrl,
        p_rif: rif,
        p_logo_url: logoUrl,
        p_image_url: "",
      });
      if (!result.ok) throw new Error(result.error || "No se pudo guardar el local.");
      setEditingId("");
      setName("");
      setZone("");
      setCity("");
      setCategory("");
      setBenefit("");
      setInstagram("");
      setWhatsapp("");
      setAddress("");
      setMapsUrl("");
      setRif("");
      setLogoUrl("");
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
        <Panel title={editingId ? "Editar local" : "Nuevo local"}>
          <form onSubmit={saveVenue} className="flex flex-col gap-3">
            <Field label="Nombre"><input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required /></Field>
            <Field label="Categoría"><input value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass} /></Field>
            <Field label="Beneficio"><input value={benefit} onChange={(event) => setBenefit(event.target.value)} className={inputClass} /></Field>
            <Field label="Instagram"><input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@usuario o URL" className={inputClass} /></Field>
            <Field label="WhatsApp"><input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="+58 424 000 0000" className={inputClass} /></Field>
            <Field label="Dirección"><input value={address} onChange={(event) => setAddress(event.target.value)} className={inputClass} /></Field>
            <Field label="Google Maps"><input value={mapsUrl} onChange={(event) => setMapsUrl(event.target.value)} className={inputClass} /></Field>
            <Field label="RIF interno"><input value={rif} onChange={(event) => setRif(event.target.value)} className={inputClass} /></Field>
            <Field label="Logo"><input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} className={inputClass} /></Field>
            <Field label="Zona"><input value={zone} onChange={(event) => setZone(event.target.value)} className={inputClass} /></Field>
            <Field label="Ciudad"><input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} /></Field>
            <label className="flex min-h-11 items-center gap-2 text-[14px] font-extrabold"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Activo</label>
            <div className="rounded-[14px] bg-[#10140A] p-3 text-[13px]">
              <p className="font-extrabold">{name || "Nombre del local"} <Chip tone="accent">Aliado oficial</Chip></p>
              <p className="text-[var(--adm-muted)]">{category || "Categoría"} · {benefit || "Beneficio"}</p>
              <p className="text-[var(--adm-muted)]">{address || "Dirección"}</p>
              <p className="mt-1 text-[12px] font-bold text-[var(--adm-muted)]">El RIF no se muestra en la app.</p>
            </div>
            <Primary type="submit" disabled={busy}>{editingId ? "Guardar cambios" : "Guardar local"}</Primary>
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
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => { setEditingId(venue.id); setName(venue.name); setZone(venue.zone); setCity(venue.city); setCategory(venue.category ?? ""); setBenefit(venue.benefit ?? ""); setInstagram(venue.instagram ?? ""); setWhatsapp(venue.whatsapp ?? ""); setAddress(venue.address ?? ""); setMapsUrl(venue.mapsUrl ?? ""); setRif(venue.rif ?? ""); setLogoUrl(venue.logoUrl ?? ""); setActive(venue.active); }} className="min-h-11 font-extrabold text-[var(--adm-accent)]">Editar</button>
                <button type="button" disabled={busy} onClick={() => void adminCall("pulse_admin_save_ally", { p_venue_id: venue.id, p_name: venue.name, p_zone: venue.zone, p_city: venue.city, p_active: !venue.active, p_category: venue.category ?? "", p_benefit: venue.benefit ?? "", p_instagram: venue.instagram ?? "", p_whatsapp: venue.whatsapp ?? "", p_address: venue.address ?? "", p_maps_url: venue.mapsUrl ?? "", p_rif: venue.rif ?? "", p_logo_url: venue.logoUrl ?? "", p_image_url: venue.imageUrl ?? "" }).then(() => load()).catch((error: unknown) => setFailure(asAdminFailure(error)))} className="min-h-11 font-extrabold text-[var(--adm-accent)]">{venue.active ? "Pausar" : "Activar"}</button>
              </div>
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
