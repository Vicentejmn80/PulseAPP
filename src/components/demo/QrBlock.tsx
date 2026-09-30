import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrBlock({ value, title = "Código QR" }: { value: string; title?: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: 320 })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [value]);

  if (!src) return null;
  return (
    <div className="text-center">
      <img src={src} alt={title} className="mx-auto h-52 w-52 rounded-2xl bg-white p-2" />
      <a href={src} download="tasca-qr.png" className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#241710] px-4 text-[13px] font-extrabold text-white">
        Descargar QR
      </a>
    </div>
  );
}
