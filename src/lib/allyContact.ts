export function whatsappDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = `58${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("4")) digits = `58${digits}`;
  return /^58\d{10}$/.test(digits) ? digits : "";
}

export function whatsappLink(value: string) {
  const digits = whatsappDigits(value);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent("Hola, te escribo desde Rusher")}`;
}

export function instagramLink(value: string) {
  const text = value.trim();
  if (!text || text === "Por confirmar") return "";
  if (/^https?:\/\//i.test(text)) return text;
  const handle = text.replace(/^@/, "").replace(/\/$/, "");
  return handle ? `https://instagram.com/${handle}` : "";
}

export function mapsLink(value: string) {
  const text = value.trim();
  return /^https?:\/\//i.test(text) ? text : "";
}
