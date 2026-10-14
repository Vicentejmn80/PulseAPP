import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode } from "lucide-react";
import { qrVisitToken } from "@/lib/qrReward";
import { visitQr } from "@/services/mechanicsApi";

type ScanState = "starting" | "scanning" | "checking" | "done" | "denied" | "unavailable" | "unsupported" | "invalid" | "rejected" | "offline";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

function detectorFromWindow(): Detector | null {
  const scope = window as Window & {
    BarcodeDetector?: new (options?: { formats?: string[] }) => Detector;
  };
  if (!scope.BarcodeDetector) return null;
  try {
    return new scope.BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export function ScanQrPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("starting");
  const [message, setMessage] = useState("");
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    async function loop(detector: Detector) {
      if (stopped || !video) return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          const raw = codes.find((code) => code.rawValue)?.rawValue;
          if (raw) {
            stopped = true;
            stream?.getTracks().forEach((track) => track.stop());
            await submit(raw);
            return;
          }
        } catch {
          /* el frame todavía no está listo */
        }
      }
      frame = window.requestAnimationFrame(() => {
        void loop(detector);
      });
    }

    async function submit(raw: string) {
      const token = qrVisitToken(raw);
      if (!token) {
        setState("invalid");
        setMessage("Ese QR no es de un local aliado.");
        return;
      }
      setState("checking");
      try {
        const result = await visitQr(token);
        if (result.ok === false) {
          setState("rejected");
          setMessage(result.error || "No se pudo validar el QR.");
          setPoints(null);
          return;
        }
        setPoints(typeof result.points === "number" ? result.points : 0);
        setState("done");
        setMessage(
          result.already
            ? "Este QR ya se usó hoy en tu cuenta. No se acreditaron puntos otra vez."
            : `Listo. Se acreditaron ${result.points ?? 0} puntos.`,
        );
      } catch {
        setState("offline");
        setMessage("No hay conexión. No se acreditaron puntos.");
      }
    }

    async function start() {
      if (!video) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        setMessage("Este dispositivo no tiene una cámara disponible.");
        return;
      }
      const detector = detectorFromWindow();
      if (!detector) {
        setState("unsupported");
        setMessage("Este navegador no puede leer códigos QR con la cámara.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
          setState("denied");
          setMessage("Necesitamos permiso para usar la cámara. Puedes activarlo en los ajustes del navegador.");
        } else {
          setState("unavailable");
          setMessage("No se pudo abrir la cámara.");
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        setState("unavailable");
        setMessage("No se pudo mostrar la cámara.");
        return;
      }
      setState("scanning");
      void loop(detector);
    }

    void start();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const showVideo = state === "starting" || state === "scanning" || state === "checking";

  return (
    <div className="flex h-full flex-col px-4 pb-6 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5" aria-hidden="true" />
          <h1 className="text-[20px] font-extrabold">Escanear QR</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="min-h-11 rounded-2xl px-3 text-[13px] font-extrabold"
          style={{ border: "1px solid var(--t-border)" }}
        >
          Cerrar
        </button>
      </div>
      <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
        Apunta al QR del local aliado. Los puntos los confirma el servidor.
      </p>
      {showVideo && (
        <video
          ref={videoRef}
          className="mt-4 aspect-square w-full rounded-[28px] bg-black object-cover"
          playsInline
          muted
          autoPlay
        />
      )}
      {state === "checking" && <p className="mt-3 text-[14px] font-extrabold">Validando el código…</p>}
      {message && (
        <p
          className="mt-4 rounded-2xl px-4 py-3 text-[14px] font-extrabold"
          style={{ backgroundColor: "var(--t-card)", color: state === "done" && points ? "var(--t-accent)" : "var(--t-text)" }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
