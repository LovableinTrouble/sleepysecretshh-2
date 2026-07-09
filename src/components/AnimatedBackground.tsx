import { useSettings } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

export function AnimatedBackground() {
  const [settings] = useSettings();
  const isMobile = useIsMobile();
  if (!settings.animatedBg || isMobile) {
    return (
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: "var(--gradient-bg)" }}
      />
    );
  }
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--gradient-bg)" }}
    >
      {/* Softer, cleaner orbs — lower opacity & blended out so foreground content reads better */}
      <div className="absolute -top-40 -left-40 h-[42rem] w-[42rem] rounded-full bg-primary/10 blur-[120px] animate-float-orb" />
      <div className="absolute top-1/3 -right-48 h-[38rem] w-[38rem] rounded-full bg-accent/10 blur-[120px] animate-float-orb [animation-delay:-6s]" />
      <div className="absolute bottom-[-10rem] left-1/4 h-[34rem] w-[34rem] rounded-full bg-accent/8 blur-[140px] animate-float-orb [animation-delay:-12s]" />
      {/* Subtle vignette to keep edges clean */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,var(--background)_100%)]" />
    </div>
  );
}
