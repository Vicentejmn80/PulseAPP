import { RUSHER_APP_ICON, RUSHER_MARK_HEADER } from "@/config/brand";

export type RusherMarkVariant = "header" | "app-icon";

/**
 * Variación A (`header`): R neón sobre transparente — el destello rodea la letra.
 * Variación B (`app-icon`): cuadrado neón full-bleed con R negra.
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
    <span
      className={glow ? "rusher-mark-shell rusher-mark-glow" : "rusher-mark-shell"}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt="Rusher"
        width={size}
        height={size}
        className="rusher-logo-header"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    </span>
  );
}
