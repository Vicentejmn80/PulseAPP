import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] justify-center">
      <div className="relative flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#FFF7F1] shadow-[0_0_80px_rgba(70,32,10,0.08)]">
        {children}
      </div>
    </div>
  );
}

export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="absolute left-4 right-4 top-4 z-[60] rounded-2xl bg-[#241710] px-4 py-3 text-center text-[13px] font-bold text-white shadow-lg">
      {message}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-[#FFE1D2]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#FFB067] to-[#FF4F1A] transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}
