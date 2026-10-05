export type VoucherStatus = "assigned" | "redeemed" | "expired";

export function voucherStatus(status: string, expiresAt: string, now = Date.now()): VoucherStatus {
  if (status === "redeemed") return "redeemed";
  const expires = new Date(expiresAt).getTime();
  if (Number.isFinite(expires) && expires <= now) return "expired";
  return "assigned";
}

export function voucherDaysLeft(expiresAt: string, now = Date.now()) {
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires) || expires <= now) return 0;
  return Math.ceil((expires - now) / 86_400_000);
}

export function voucherLabel(status: VoucherStatus, daysLeft: number) {
  if (status === "redeemed") return "Canjeado";
  if (status === "expired") return "Vencido";
  if (daysLeft <= 1) return "Vence hoy";
  return `Quedan ${daysLeft} días`;
}

export function mapsQuery(input: { address?: string; lat?: number | null; lng?: number | null }) {
  if (input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${input.lat},${input.lng}`;
  }
  const address = (input.address ?? "").trim();
  if (!address || address === "Por confirmar") return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
