import { useEffect, useState } from "react";

export function WowBurst({ message, onDone }: { message: string; onDone: () => void }) {
  const [on, setOn] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return undefined;
    setOn(true);
    const timer = window.setTimeout(() => {
      setOn(false);
      onDone();
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  if (!on || !message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-50 flex justify-center">
      <p className="pulse-wow rounded-full bg-[#241710] px-5 py-3 text-[18px] font-extrabold text-white shadow-lg">{message}</p>
    </div>
  );
}

export function Countdown({ until }: { until?: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!until) return undefined;
    function tick() {
      const left = Date.parse(until!) - Date.now();
      if (left <= 0) {
        setLabel("Se cerró");
        return;
      }
      const hours = Math.floor(left / 3_600_000);
      const minutes = Math.floor((left % 3_600_000) / 60_000);
      setLabel(hours > 0 ? `Te quedan ${hours}h ${minutes}m` : `Te quedan ${minutes}m`);
    }
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [until]);

  if (!until || !label) return null;
  return <p className="text-[12px] font-extrabold text-[#FF4F1A]">Solo hoy · {label}</p>;
}
