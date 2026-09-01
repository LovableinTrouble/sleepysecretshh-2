import { useSettings } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Site background. Layered aurora mesh + fine grain + vignette so foreground
 * glass/pill controls always read cleanly on top of it.
 */
export function AnimatedBackground() {
  const [settings] = useSettings();
  const isMobile = useIsMobile();
  const still = !settings.animatedBg || isMobile;

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--gradient-bg)" }}
    >
      {/* Restrained cinematic illumination */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(100% 65% at 50% -15%, color-mix(in oklab, var(--primary) 13%, transparent) 0%, transparent 66%)",
        }}
      />

      {/* Slow ambient light, kept away from the reading plane */}
      <div
        className={`absolute -top-1/2 left-[-22%] h-[72rem] w-[72rem] rounded-full bg-primary/8 blur-[180px] ${
          still ? "" : "animate-float-orb"
        }`}
      />
      <div
        className={`absolute top-1/3 right-[-28%] h-[62rem] w-[62rem] rounded-full bg-accent/7 blur-[190px] ${
          still ? "" : "animate-float-orb [animation-delay:-7s]"
        }`}
      />
      <div
        className={`absolute bottom-[-26rem] left-1/3 h-[54rem] w-[54rem] rounded-full bg-primary/6 blur-[190px] ${
          still ? "" : "animate-float-orb [animation-delay:-14s]"
        }`}
      />

      {/* Fine mesh lines for depth */}
      <div className="absolute inset-0 bg-mesh-grid opacity-[0.025]" />

      {/* Grain */}
      <div className="absolute inset-0 bg-grain opacity-[0.035]" />

      {/* Vignette keeps edges calm and content centred */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,var(--background)_100%)]" />
    </div>
  );
}
