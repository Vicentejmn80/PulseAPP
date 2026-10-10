import { useState } from "react";
import { useNavigate } from "react-router-dom";

const BANNER_SRC = "/banners/garrison-aliados.jpg";

const BANNER_COPY =
  "Nuevos aliados. Locales afiliados. Juega, escanea el QR y gana beneficios en los lugares que ya conoces. Garrison Barber Society. Beneficio en tu primera visita escaneando el QR en la barbería. Pronostica, escanea y gana.";

/**
 * Banner de Garrison Barber Society en el inicio de Béisbol Rush.
 * No hay ficha propia de Garrison en el catálogo: "Ver más" abre la sección
 * existente de tascas (/tobo/tascas). La Europea sigue en la base y en su ficha;
 * solo se retira de este espacio.
 */
export function FounderBanner() {
  const navigate = useNavigate();
  const [imageReady, setImageReady] = useState(true);

  function openTascas() {
    navigate("/tobo/tascas");
  }

  if (!imageReady) {
    return <GarrisonBannerCopy onOpen={openTascas} />;
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
        alt=""
        width={1080}
        height={540}
        draggable={false}
        className="block h-auto w-full max-w-full"
        onError={() => setImageReady(false)}
      />
    </button>
  );
}

function GarrisonBannerCopy({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="overflow-hidden rounded-[20px] px-4 py-4"
      style={{
        background: "linear-gradient(160deg, #14180f 0%, #0B0D0F 55%, #12160a 100%)",
        border: "1px solid #2A2F33",
      }}
    >
      <p className="inline-flex rounded-sm bg-[#CFFF00] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#0B0D0F]">
        Nuevos aliados
      </p>
      <h2 className="mt-3 text-[28px] font-extrabold uppercase leading-none text-white">
        Locales
        <br />
        <span className="text-[#CFFF00]">afiliados</span>
      </h2>
      <p className="mt-3 max-w-[34ch] text-[13px] font-semibold leading-snug text-[#C5C9C0]">
        Juega, escanea el QR y gana beneficios en los lugares que ya conoces.
      </p>
      <div className="mt-4 rounded-2xl px-3 py-3" style={{ border: "1px solid #CFFF00", backgroundColor: "#10130E" }}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#CFFF00]">Aliado oficial</p>
        <p className="mt-1 text-[18px] font-extrabold uppercase leading-none text-white">Garrison</p>
        <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#CFFF00]">Barber Society</p>
        <p className="mt-2 text-[12px] font-semibold leading-snug text-[#C5C9C0]">
          Beneficio en tu primera visita escaneando el QR en la barbería.
        </p>
      </div>
      <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9BA1A6]">Cómo jugar</p>
      <ol className="mt-2 flex flex-wrap gap-2 text-[12px] font-extrabold text-white">
        <li className="rounded-full bg-[#1B1F22] px-3 py-1">1 Pronostica</li>
        <li className="rounded-full bg-[#1B1F22] px-3 py-1">2 Escanea</li>
        <li className="rounded-full bg-[#1B1F22] px-3 py-1">3 Gana</li>
      </ol>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#CFFF00] px-5 text-[13px] font-extrabold text-[#0B0D0F]"
      >
        Ver más →
      </button>
    </div>
  );
}
