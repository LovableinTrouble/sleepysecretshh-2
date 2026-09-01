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
      {/* Deep base tint */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--primary) 20%, transparent) 0%, transparent 60%)",
        }}
      />

      {/* Aurora ribbons */}
      <div
        className={`absolute -top-1/3 left-[-15%] h-[70rem] w-[70rem] rounded-full bg-primary/12 blur-[150px] ${
          still ? "" : "animate-float-orb"
        }`}
      />
      <div
        className={`absolute top-1/4 right-[-20%] h-[60rem] w-[60rem] rounded-full bg-accent/12 blur-[160px] ${
          still ? "" : "animate-float-orb [animation-delay:-7s]"
        }`}
      />
      <div
        className={`absolute bottom-[-20rem] left-1/3 h-[52rem] w-[52rem] rounded-full bg-primary/8 blur-[170px] ${
          still ? "" : "animate-float-orb [animation-delay:-14s]"
        }`}
      />

      {/* Fine mesh lines for depth */}
      <div className="absolute inset-0 bg-mesh-grid opacity-[0.05]" />

      {/* Grain */}
      <div className="absolute inset-0 bg-grain opacity-[0.035]" />

      {/* Vignette keeps edges calm and content centred */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,var(--background)_100%)]" />
    </div>
  );
}
