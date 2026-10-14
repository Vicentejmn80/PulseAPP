import { QrCode } from "lucide-react";

export function ScanQrButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Escanear QR"
      className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-extrabold"
      style={{ backgroundColor: "var(--t-card, var(--p-card))", border: "1px solid var(--t-border, #2A2F33)", color: "var(--t-text, var(--p-text))" }}
    >
      <QrCode className="h-4 w-4" aria-hidden="true" />
      <span>Escanear QR</span>
    </button>
  );
}
