import type { ReactNode } from "react";

export function BackButton({ onClick, label = "Volver" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(80,40,10,0.08)]"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#241710" strokeWidth="2.4" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  testid,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testid?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#FF4F1A] text-[17px] font-extrabold text-white shadow-[0_12px_24px_rgba(255,79,26,0.35)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
