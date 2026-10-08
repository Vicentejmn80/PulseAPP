import { RusherLogo } from "@/components/ui/RusherLogo";

export type RusherMarkVariant = "header" | "app-icon";

/** Marca in-app: SVG neón. El destello sigue el contorno de la R, no un cuadrado. */
export function RusherMark({
  size = 88,
  glow = false,
}: {
  size?: number;
  glow?: boolean;
  variant?: RusherMarkVariant;
}) {
  return (
    <span
      className={glow ? "rusher-mark-shell rusher-mark-glow" : "rusher-mark-shell"}
      style={{ width: size, height: size, color: "#CCFF00" }}
    >
      <RusherLogo className="rusher-logo-header" />
    </span>
  );
}
