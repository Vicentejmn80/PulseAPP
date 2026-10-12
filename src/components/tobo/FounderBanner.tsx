import { useState } from "react";
import { useNavigate } from "react-router-dom";

const BANNER_SRC = `${import.meta.env.BASE_URL}rusher-locales-afiliados.jpg?v=4`;

const BANNER_COPY =
  "Nuevos aliados. Locales aliados. Juega, escanea el QR y gana beneficios en los lugares que ya conoces. Garrison Barber Society, aliado oficial. Beneficio en tu primera visita escaneando el QR en la barbería. Pronostica, escanea y gana.";

/**
 * Banner de Garrison Barber Society en el inicio de Béisbol Rush.
 * "Ver más" abre la sección de aliados (/tobo/tascas).
 */
export function FounderBanner() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => navigate("/tobo/tascas")}
      aria-label={BANNER_COPY}
      className="relative block w-full shrink-0 overflow-hidden rounded-[20px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CFFF00]"
      style={{ aspectRatio: "2 / 1", border: "1px solid #2A2F33", backgroundColor: "#0B0D0F" }}
    >
      {failed ? (
        <span className="block px-5 py-6">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#C8FF00" }}>
            Nuevos aliados
          </span>
          <span className="mt-2 block text-[22px] font-extrabold leading-tight">Locales aliados</span>
          <span className="mt-2 block text-[14px] font-semibold leading-snug" style={{ color: "#C7CDD1" }}>
            Garrison Barber Society. Pronostica, escanea el QR y gana.
          </span>
        </span>
      ) : (
        <img
          src={BANNER_SRC}
          alt={BANNER_COPY}
          width={1024}
          height={512}
          draggable={false}
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain"
          onError={() => {
            console.error("No se pudo cargar el banner de aliados", BANNER_SRC);
            setFailed(true);
          }}
        />
      )}
    </button>
  );
}
