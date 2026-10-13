import type { ReactNode } from "react";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full">
      <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#0B0D0F]">
        {children}
        <AppUpdateNotice />
      </div>
    </div>
  );
}

export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="absolute left-4 right-4 top-4 z-[60] rounded-2xl bg-[#CFFF00] px-4 py-3 text-center text-[13px] font-bold text-[#0B0D0F] shadow-lg">
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
