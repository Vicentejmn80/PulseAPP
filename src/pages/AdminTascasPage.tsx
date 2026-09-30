import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrBlock } from "@/components/demo/QrBlock";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import { canAccessSuperAdmin, slugify, venueQrPath } from "@/lib/demoMatch";
import { adminVenueList, saveVenue, type VenueCard } from "@/services/demoApi";

const KEY = "pulse-admin-key";

const blank = {
  id: "",
  name: "",
  slug: "",
  zone: "",
  city: "Caracas",
  address: "",
  contact: "",
  description: "",
  sponsorText: "Esta tasca forma parte de Juégate el Tobo.",
  prize: "",
  prizeDetail: "",
  quantity: "1",
  terms: "Canje válido hasta 14 días después de ser asignado.",
  starts: "",
  ends: "",
  logo: "",
  image: "",
  active: true,
  cycle: "ronda_1",
};

export function AdminTascasPage() {
  const navigate = useNavigate();
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY) ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [venues, setVenues] = useState<VenueCard[]>([]);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [regen, setRegen] = useState(false);

  function patch(partial: Partial<typeof blank>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  async function unlock(key = adminKey) {
    const trimmed = key.trim();
    if (!canAccessSuperAdmin(trimmed.length > 0)) {
      setError("Esta área es del Super Admin.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const rows = await adminVenueList(trimmed);
      sessionStorage.setItem(KEY, trimmed);
      setAdminKey(trimmed);
      setVenues(rows);
      setUnlocked(true);
    } catch (reason: unknown) {
      setUnlocked(false);
      setError(reason instanceof Error ? reason.message : "No se pudo abrir el Super Admin.");
    } finally {
      setPending(false);
    }
  }

  function edit(venue: VenueCard) {
    setRegen(false);
    setForm({
      id: venue.id,
      name: venue.name,
      slug: venue.slug,
      zone: venue.zone,
      city: venue.city,
      address: venue.address,
      contact: venue.contact,
      description: venue.description,
      sponsorText: venue.sponsorText,
      prize: venue.roundPrize,
      prizeDetail: venue.prizeDetail,
      quantity: String(venue.prizeQuantity),
      terms: venue.prizeTerms,
      starts: venue.prizeStarts ?? "",
      ends: venue.prizeEnds ?? "",
      logo: venue.logoUrl,
      image: venue.imageUrl,
      active: venue.active,
      cycle: venue.cycleId || "ronda_1",
    });
  }

  async function onSave() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await saveVenue({
        adminKey: adminKey.trim(),
        id: form.id,
        name: form.name,
        slug: form.slug || slugify(form.name),
        zone: form.zone,
        city: form.city,
        address: form.address,
        contact: form.contact,
        description: form.description,
        sponsorText: form.sponsorText,
        prize: form.prize,
        prizeDetail: form.prizeDetail,
        quantity: Number(form.quantity) || 0,
        terms: form.terms,
        starts: form.starts,
        ends: form.ends,
        logo: form.logo,
        image: form.image,
        active: form.active,
        cycle: form.cycle,
        regen,
      });
      setNotice(form.id ? "Tasca actualizada." : "Tasca creada.");
      setRegen(false);
      setForm(blank);
      setVenues(await adminVenueList(adminKey.trim()));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 100_000) {
      setError("El logo tiene que pesar menos de 100 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch({ logo: String(reader.result ?? "") });
    reader.readAsDataURL(file);
  }

  const selected = venues.find((venue) => venue.id === form.id);
  const qrTarget = form.slug ? `${window.location.origin}${venueQrPath(form.slug)}` : "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/admin/partidos")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Super Admin</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Tascas</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {!unlocked && (
          <section className="rounded-[24px] bg-white px-4 py-4">
            <p className="text-[16px] font-extrabold">Área protegida</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Un usuario normal no administra tascas, premios ni QR.</p>
            <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} aria-label="Clave de admin" className="mt-3 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" autoComplete="off" />
            <div className="mt-3">
              <PrimaryButton disabled={pending} onClick={() => void unlock()}>Entrar</PrimaryButton>
            </div>
          </section>
        )}
        {error && <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {notice && <p className="mt-3 rounded-2xl bg-[#241710] px-4 py-3 text-[13px] font-bold text-white">{notice}</p>}
        {unlocked && (
          <>
            <section className="mt-3 rounded-[24px] bg-white px-4 py-4">
              <p className="text-[16px] font-extrabold">{form.id ? "Editar tasca" : "Crear tasca"}</p>
              <input value={form.name} onChange={(event) => patch({ name: event.target.value, slug: form.id ? form.slug : slugify(event.target.value) })} aria-label="Nombre" placeholder="Nombre" className="mt-3 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.slug} onChange={(event) => patch({ slug: slugify(event.target.value) })} aria-label="Enlace" placeholder="Enlace" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.zone} onChange={(event) => patch({ zone: event.target.value })} aria-label="Zona" placeholder="Zona" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.city} onChange={(event) => patch({ city: event.target.value })} aria-label="Ciudad" placeholder="Ciudad" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.address} onChange={(event) => patch({ address: event.target.value })} aria-label="Dirección" placeholder="Dirección" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.contact} onChange={(event) => patch({ contact: event.target.value })} aria-label="Contacto" placeholder="Contacto" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <textarea value={form.description} onChange={(event) => patch({ description: event.target.value })} aria-label="Descripción" placeholder="Descripción" className="mt-2 h-20 w-full rounded-2xl bg-[#FFF7F1] px-3 py-2 text-[14px] font-bold outline-none" />
              <textarea value={form.sponsorText} onChange={(event) => patch({ sponsorText: event.target.value })} aria-label="Texto de patrocinio" placeholder="Texto de patrocinio" className="mt-2 h-20 w-full rounded-2xl bg-[#FFF7F1] px-3 py-2 text-[14px] font-bold outline-none" />
              <input value={form.prize} onChange={(event) => patch({ prize: event.target.value })} aria-label="Premio" placeholder="Premio actual" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <textarea value={form.prizeDetail} onChange={(event) => patch({ prizeDetail: event.target.value })} aria-label="Descripción del premio" placeholder="Descripción del premio" className="mt-2 h-20 w-full rounded-2xl bg-[#FFF7F1] px-3 py-2 text-[14px] font-bold outline-none" />
              <input value={form.quantity} onChange={(event) => patch({ quantity: event.target.value })} inputMode="numeric" aria-label="Cantidad" placeholder="Cantidad" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <textarea value={form.terms} onChange={(event) => patch({ terms: event.target.value })} aria-label="Condiciones" placeholder="Condiciones" className="mt-2 h-20 w-full rounded-2xl bg-[#FFF7F1] px-3 py-2 text-[14px] font-bold outline-none" />
              <input value={form.starts} onChange={(event) => patch({ starts: event.target.value })} type="date" aria-label="Inicio del premio" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.ends} onChange={(event) => patch({ ends: event.target.value })} type="date" aria-label="Fin del premio" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.cycle} onChange={(event) => patch({ cycle: event.target.value })} aria-label="Ciclo" placeholder="Ciclo" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[15px] font-bold outline-none" />
              <input value={form.logo} onChange={(event) => patch({ logo: event.target.value })} aria-label="Logo" placeholder="URL del logo" className="mt-2 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[14px] font-bold outline-none" />
              <input type="file" accept="image/*" aria-label="Subir logo" onChange={(event) => onLogo(event.target.files?.[0])} className="mt-2 block w-full text-[13px] font-bold" />
              <label className="mt-3 flex items-center gap-2 text-[14px] font-extrabold">
                <input type="checkbox" checked={form.active} onChange={(event) => patch({ active: event.target.checked })} />
                Tasca activa
              </label>
              {form.id && (
                <label className="mt-2 flex items-center gap-2 text-[14px] font-extrabold">
                  <input type="checkbox" checked={regen} onChange={(event) => setRegen(event.target.checked)} />
                  Generar un QR nuevo al guardar
                </label>
              )}
              <div className="mt-3">
                <PrimaryButton disabled={pending} onClick={() => void onSave()}>{form.id ? "Guardar cambios" : "Crear tasca"}</PrimaryButton>
              </div>
              {form.id && (
                <button type="button" onClick={() => { setForm(blank); setRegen(false); }} className="mt-3 text-[13px] font-extrabold text-[#8D7366]">Nueva tasca</button>
              )}
            </section>
            {qrTarget && form.id && (
              <section className="mt-3 rounded-[24px] bg-white px-4 py-4">
                <p className="text-[14px] font-extrabold">QR de {form.name}</p>
                <p className="mt-1 text-[12px] font-bold text-[#A08B80]">{form.slug}{selected?.qrToken ? ` · ${selected.qrToken}` : ""}</p>
                <p className="mt-1 text-[12px] font-bold text-[#A08B80]">{selected?.active ? "Activa" : "Inactiva"} · {selected?.scanCount ?? 0} escaneos</p>
                <div className="mt-3">
                  <QrBlock value={qrTarget} title={`QR de ${form.name}`} />
                </div>
              </section>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {venues.map((venue) => (
                <button key={venue.id} type="button" onClick={() => edit(venue)} className="rounded-[22px] bg-white px-4 py-3 text-left">
                  <span className="block text-[16px] font-extrabold">{venue.name}</span>
                  <span className="block text-[13px] font-semibold text-[#8D7366]">{venue.zone || "Sin zona"} · {venue.roundPrize || "Sin premio"}</span>
                  <span className="block text-[12px] font-extrabold text-[#FF4F1A]">{venue.active ? "Activa" : "Inactiva"} · {venue.scanCount ?? 0} escaneos</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
