import { RUSHER_APP_ICON, RUSHER_MARK_HEADER } from "@/config/brand";

export type RusherMarkVariant = "header" | "app-icon";

/**
 * Variación A (`header`): R neón #CFFF00 sobre fondo oscuro/transparente.
 * Variación B (`app-icon`): cuadrado neón full-bleed con R negra (solo vista previa).
 */
export function RusherMark({
  size = 88,
  glow = false,
  variant = "header",
}: {
  size?: number;
  glow?: boolean;
  variant?: RusherMarkVariant;
}) {
  const src = variant === "app-icon" ? RUSHER_APP_ICON : RUSHER_MARK_HEADER;
  return (
    <img
      src={src}
      alt="Rusher"
      width={size}
      height={size}
      className={glow ? "rusher-mark-glow" : "rusher-logo-header"}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
