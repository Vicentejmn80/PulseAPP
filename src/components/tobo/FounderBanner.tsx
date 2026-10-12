import { useNavigate } from "react-router-dom";

const BANNER_SRC = `${import.meta.env.BASE_URL}rusher-locales-afiliados.jpg?v=2`;

const BANNER_COPY =
  "Nuevos aliados. Locales aliados. Juega, escanea el QR y gana beneficios en los lugares que ya conoces. Garrison Barber Society. Beneficio en tu primera visita escaneando el QR en la barbería. Pronostica, escanea y gana.";

/**
 * Banner de Garrison Barber Society en el inicio de Béisbol Rush.
 * No hay ficha propia de Garrison en el catálogo: "Ver más" abre la sección
 * existente de tascas (/tobo/tascas). La Europea sigue en la base y en su ficha;
 * solo se retira de este espacio.
 */
export function FounderBanner() {
  const navigate = useNavigate();

  function openTascas() {
    navigate("/tobo/tascas");
  }

  return (
    <button
      type="button"
      onClick={openTascas}
      aria-label={`${BANNER_COPY} Ver más.`}
      className="block w-full overflow-hidden rounded-[20px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CFFF00]"
      style={{ border: "1px solid #2A2F33", backgroundColor: "#0B0D0F" }}
    >
      <img
        src={BANNER_SRC}
        alt={BANNER_COPY}
        width={768}
        height={384}
        draggable={false}
        decoding="async"
        className="block h-auto w-full max-w-full object-contain"
      />
    </button>
  );
}
