import { useSettings } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Site background. Uses plain radial gradients (no large blur filters) so
 * scrolling and clicks stay responsive on every device.
 */
export function AnimatedBackground() {
  const [settings] = useSettings();
  const isMobile = useIsMobile();
  const still = !settings.animatedBg || isMobile;

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--gradient-bg)", contain: "strict" }}
    >
      {/* Restrained cinematic illumination */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(100% 65% at 50% -15%, color-mix(in oklab, var(--primary) 13%, transparent) 0%, transparent 66%)",
        }}
      />

      {/* Soft ambient light — gradients instead of blurred orbs (much cheaper) */}
      <div
        className={`absolute -top-[30%] left-[-20%] h-[70rem] w-[70rem] rounded-full ${still ? "" : "animate-float-orb"}`}
        style={{
          backgroundImage:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 16%, transparent), transparent 72%)",
          willChange: still ? undefined : "transform",
        }}
      />
      <div
        className={`absolute top-1/3 right-[-26%] h-[60rem] w-[60rem] rounded-full ${still ? "" : "animate-float-orb [animation-delay:-7s]"}`}
        style={{
          backgroundImage:
            "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 14%, transparent), transparent 72%)",
          willChange: still ? undefined : "transform",
        }}
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
