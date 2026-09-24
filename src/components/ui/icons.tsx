import type { ReactNode } from "react";

function Svg({ children, className = "w-6 h-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

export function IconTrophy({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M17 3H7v2H4.2A2.2 2.2 0 0 0 2 7.2C2 10 4.1 12.3 6.8 12.8A6.2 6.2 0 0 0 11 16.2V18H8.4a1 1 0 0 0 0 2h7.2a1 1 0 0 0 0-2H13v-1.8a6.2 6.2 0 0 0 4.2-3.4C19.9 12.3 22 10 22 7.2A2.2 2.2 0 0 0 19.8 5H17V3zM7 7H4.3C4.6 8.8 5.6 10.2 7 10.8V7zm10 3.8c1.4-.6 2.4-2 2.7-3.8H17v3.8z" />
    </Svg>
  );
}

export function IconFire({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12.2 2c.4 2.6-.6 4.2-1.8 5.4 1.7.2 3.3-1 3.8-1 .2 2.2 2.6 3.6 2.6 6.5A6.8 6.8 0 0 1 8 18.6c-2.6-1.5-3.6-4.3-2.4-7.1 1 .4 2.2-.1 2.6-1.1C9 12 11 12.4 11.6 10.2 12.4 8.2 12 5.2 12.2 2z" />
    </Svg>
  );
}

export function IconPin({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 2.2A7.2 7.2 0 0 0 4.8 9.4c0 5.1 6.1 11.8 6.7 12.4a.7.7 0 0 0 1 0c.6-.6 6.7-7.3 6.7-12.4A7.2 7.2 0 0 0 12 2.2zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z" />
    </Svg>
  );
}

export function IconPeople({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M9 11a3.2 3.2 0 1 0-3.2-3.2A3.2 3.2 0 0 0 9 11zm6.2-.4a2.7 2.7 0 1 0-2.7-2.7 2.7 2.7 0 0 0 2.7 2.7zM9 12.4c-3.1 0-6 1.6-6 3.8V18h12v-1.8c0-2.2-2.9-3.8-6-3.8zm6.3.3c-.4 0-.9 0-1.3.1 1.5.9 2.4 2.1 2.4 3.4V18H21v-1.6c0-2-2.5-3.7-5.7-3.7z" />
    </Svg>
  );
}

export function IconMedal({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M8 2h3.2L12 6.2 8 2zm4.8 0H16l-4 4.2L12.8 2zM7.2 8.2h9.6v1.2a4.8 4.8 0 1 1-9.6 0V8.2z" />
      <circle cx="12" cy="14.2" r="2.1" fill="#fff" opacity=".9" />
    </Svg>
  );
}

export function IconCoin({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 2.4l1.7 5.1h5.4l-4.4 3.2 1.7 5.2L12 13.2 7.6 15.9l1.7-5.2-4.4-3.2h5.4L12 2.4z" />
    </Svg>
  );
}

export function IconBolt({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M13 2L4 14h6l-1 8 10-14h-6l0-6z" />
    </Svg>
  );
}

export function PulseArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M4 16h6l2.5-6 4.5 12 3-6H28" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
