/** Identificador de visita que se puede mandar a pulse_qr_visit. No incluye puntos. */
export function qrVisitToken(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 500) return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts.lastIndexOf("q");
    const token = marker >= 0 ? parts[marker + 1] ?? "" : "";
    return tokenShape(decodeURIComponent(token));
  } catch {
    return tokenShape(value);
  }
}

function tokenShape(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(value)) return null;
  return value;
}

/** Argumentos del RPC. El saldo lo decide el servidor con QR_POINTS. */
export function qrVisitRpcArgs(sessionToken: string, code: string) {
  return { p_token: sessionToken, p_qr: code };
}
