import { RusherSplashMark } from "@/components/ui/RusherLogo";

/** Splash de marca: R neón sobre el mismo carbón, sin caja. */
export function RusherSplash({ phase = "play" }: { phase?: "play" | "exit" }) {
  return (
    <div className={`rusher-splash${phase === "exit" ? " is-exit" : ""}`}>
      <div className="rusher-splash__bloom" aria-hidden="true" />
      <div className="rusher-splash__mark">
        <RusherSplashMark />
      </div>
      <p className="rusher-splash__name">RUSHER</p>
      <p className="rusher-splash__slogan">Cualquier lugar puede tener un Rush.</p>
    </div>
  );
}
