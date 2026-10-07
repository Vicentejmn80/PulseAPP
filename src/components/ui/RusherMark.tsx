export function RusherMark({
  size = 88,
  glow = false,
}: {
  size?: number;
  glow?: boolean;
}) {
  return (
    <img
      src="/rusher-mark.png"
      alt="Rusher"
      width={size}
      height={size}
      className={glow ? "rusher-mark-glow" : undefined}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
