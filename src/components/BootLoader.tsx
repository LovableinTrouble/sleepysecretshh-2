import { useEffect, useState } from "react";
import { Logo } from "./Logo";

let bootShown = false;

export function BootLoader() {
  const [phase, setPhase] = useState<"in" | "out" | "gone">(bootShown ? "gone" : "in");

  useEffect(() => {
    if (bootShown) return;
    bootShown = true;
    const t1 = setTimeout(() => setPhase("out"), 550);
    const t2 = setTimeout(() => setPhase("gone"), 950);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-300 ease-out ${phase === "out" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 45%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-6">
        <div className="animate-soft-rise">
          <Logo size={52} />
        </div>
        <div className="relative h-[2px] w-24 overflow-hidden rounded-full bg-white/8">
          <div
            className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary"
            style={{ animation: "bootSlide 1.1s cubic-bezier(.4,0,.2,1) infinite" }}
          />
        </div>
      </div>
      <style>{`
        @keyframes bootSlide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(360%); }
        }
      `}</style>
    </div>
  );
}
