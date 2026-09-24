export function Avatar({
  initials,
  bg,
  size = 36,
  ring = false,
}: {
  initials: string;
  bg: string;
  size?: number;
  ring?: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${ring ? "ring-2 ring-white" : ""}`}
      style={{ width: size, height: size, background: bg, color: "#fff", fontSize: size * 0.34 }}
    >
      {initials}
    </div>
  );
}
