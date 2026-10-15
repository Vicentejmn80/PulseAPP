import { useState } from "react";
import { avatarById } from "@/config/avatars";

export function Avatar({
  initials,
  bg,
  size = 36,
  ring = false,
  avatarId,
}: {
  initials: string;
  bg: string;
  size?: number;
  ring?: boolean;
  avatarId?: string | null;
}) {
  const avatar = avatarById(avatarId);
  const [failed, setFailed] = useState(false);
  if (!avatar || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${ring ? "ring-2 ring-white" : ""}`}
        style={{ width: size, height: size, background: bg, color: "#fff", fontSize: size * 0.34 }}
      >
        {initials}
      </div>
    );
  }
  return (
    <img
      src={avatar.src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-white" : ""}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
