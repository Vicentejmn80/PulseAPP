import { RUSHER_LETTER_PATH, RUSHER_STAR_PATH } from "@/components/ui/rusherLogoPaths";

/** R neón vectorial. La estrella es un hueco (evenodd) para que se vea el fondo. */
export function RusherLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d={RUSHER_LETTER_PATH} />
    </svg>
  );
}

export function RusherSplashMark() {
  return (
    <svg className="rusher-splash__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path className="rusher-splash__star" d={RUSHER_STAR_PATH} />
      <path className="rusher-splash__letter" fillRule="evenodd" d={RUSHER_LETTER_PATH} />
    </svg>
  );
}
