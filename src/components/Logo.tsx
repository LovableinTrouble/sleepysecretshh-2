import { Link } from "@tanstack/react-router";

export function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-label="Sleepy"
    >
      <defs>
        <linearGradient id="sleepyGrad" x1="6" y1="6" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="oklch(0.98 0.06 305)" />
          <stop offset="50%" stopColor="oklch(0.78 0.22 305)" />
          <stop offset="100%" stopColor="oklch(0.52 0.24 295)" />
        </linearGradient>
        <radialGradient id="sleepyGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.85 0.2 305)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="oklch(0.4 0.2 295)" stopOpacity="0" />
        </radialGradient>
        <mask id="sleepyCrescentMask">
          <rect width="48" height="48" fill="white" />
          <circle cx="30" cy="18" r="13.5" fill="black" />
        </mask>
      </defs>
      {/* outer glow */}
      <circle cx="22" cy="24" r="20" fill="url(#sleepyGlow)" />
      {/* crescent moon */}
      <circle cx="22" cy="24" r="16" fill="url(#sleepyGrad)" mask="url(#sleepyCrescentMask)" />
      {/* sparkle */}
      <path d="M37 8.5l1.2 3.4 3.3 1.2-3.3 1.2-1.2 3.4-1.2-3.4-3.3-1.2 3.3-1.2L37 8.5Z" fill="oklch(0.97 0.04 300)" />
      {/* stars */}
      <circle cx="41" cy="26" r="1.3" fill="oklch(0.92 0.08 305)" opacity="0.95" />
      <circle cx="31" cy="6.5" r="0.9" fill="oklch(0.96 0.03 300)" opacity="0.85" />
      <circle cx="9" cy="14" r="0.7" fill="oklch(0.96 0.03 300)" opacity="0.6" />
    </svg>
  );
}

export function LogoWord({ size = 32 }: { size?: number }) {
  return (
    <Link
      to="/"
      aria-label="Sleepy — Home"
      className="group flex select-none items-center gap-2.5 rounded-full px-2 py-1.5 transition hover:opacity-90"
    >
      <Logo size={size} className="animate-moon-glow drop-shadow-[0_0_12px_rgba(168,85,247,0.35)] transition-transform duration-500 group-hover:rotate-[-12deg] group-hover:scale-105" />
      <span className="text-sm font-black leading-none tracking-[0.4em] gradient-text md:text-base">
        Sleepy
      </span>
    </Link>
  );
}
