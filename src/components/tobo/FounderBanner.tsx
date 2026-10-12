import { useState } from "react";
import { useNavigate } from "react-router-dom";

const BANNER_SRC = `${import.meta.env.BASE_URL}rusher-locales-afiliados.jpg?v=3`;

const BANNER_COPY =
  "Nuevos aliados. Locales aliados. Juega, escanea el QR y gana beneficios en los lugares que ya conoces. Garrison Barber Society. Beneficio en tu primera visita escaneando el QR en la barbería. Pronostica, escanea y gana.";

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
      aria-label={`${BANNER_COPY} Ver más.`}
      className="block w-full overflow-hidden rounded-[20px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CFFF00]"
      style={{ border: "1px solid #2A2F33", backgroundColor: "#0B0D0F" }}
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
          <span className="mt-4 inline-flex rounded-full px-4 py-2 text-[14px] font-extrabold text-[#0B0D0F]" style={{ backgroundColor: "#C8FF00" }}>
            Ver más
          </span>
        </span>
      ) : (
        <img
          src={BANNER_SRC}
          alt={BANNER_COPY}
          width={768}
          height={384}
          draggable={false}
          decoding="async"
          className="block h-auto w-full max-w-full object-contain"
          style={{ aspectRatio: "2 / 1" }}
          onError={() => {
            console.error("No se pudo cargar el banner de aliados", BANNER_SRC);
            setFailed(true);
          }}
        />
      )}
    </button>
  );
}
