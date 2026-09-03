interface Props {
  /** Name / email used to derive the monogram. */
  seed?: string | null;
  className?: string;
}

/** Clean monogram avatar used whenever a user has no profile picture. */
export function DefaultAvatar({ seed, className = "" }: Props) {
  const clean = (seed ?? "").trim();
  const initial = clean ? clean.slice(0, 1).toUpperCase() : "";
  return (
    <span
      className={`relative grid place-items-center overflow-hidden rounded-full ring-1 ring-foreground/15 ${className}`}
      style={{
        background:
          "linear-gradient(150deg, color-mix(in oklab, var(--primary) 78%, transparent), color-mix(in oklab, var(--accent) 62%, transparent))",
      }}
      aria-hidden
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 25% 12%, color-mix(in oklab, white 30%, transparent), transparent 60%)",
        }}
      />
      {initial ? (
        <span className="relative font-black leading-none tracking-tight text-primary-foreground [font-size:0.5em]">
          {initial}
        </span>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="relative h-[0.55em] w-[0.55em] text-primary-foreground"
          fill="currentColor"
        >
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M4.6 20.4c.5-4.1 3.6-6.4 7.4-6.4s6.9 2.3 7.4 6.4z" />
        </svg>
      )}
    </span>
  );
}
