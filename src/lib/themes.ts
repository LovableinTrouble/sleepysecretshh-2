// 10 preset themes. Each defines a complete set of design tokens applied via
// [data-theme="..."] on <html>. No live color-picking — just clean presets.

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  swatch: [string, string, string]; // 3 preview colors (hex/oklch ok in style attr)
}

export const THEMES: ThemePreset[] = [
  { id: "midnight-violet", name: "Midnight Violet",  description: "Deep indigo with violet glow.",          swatch: ["#1a1430", "#2a1d4d", "#b06bff"] },
  { id: "noir",            name: "Noir",             description: "Pure monochrome cinema.",               swatch: ["#0a0a0a", "#1a1a1a", "#f5f5f5"] },
  { id: "abyss",           name: "Abyss",            description: "Deep-sea blue with teal accents.",      swatch: ["#06141f", "#0d2a3d", "#5cbdb9"] },
  { id: "rose-dusk",       name: "Rose Dusk",        description: "Warm charcoal with rose accents.",      swatch: ["#1a1216", "#2a1820", "#ff6b8e"] },
  { id: "emerald-deep",    name: "Emerald Deep",     description: "Forest dark with emerald glow.",        swatch: ["#0a1612", "#0f2a20", "#34d399"] },
  { id: "amber-noir",      name: "Amber Noir",       description: "Black with warm amber accents.",        swatch: ["#0c0a08", "#1c1610", "#f59e0b"] },
  { id: "cyber-mint",      name: "Cyber Mint",       description: "Inky dark with neon mint.",             swatch: ["#070d10", "#0d1b1f", "#5eead4"] },
  { id: "crimson-ink",     name: "Crimson Ink",      description: "Almost-black with deep red.",           swatch: ["#0f0708", "#1d0c0f", "#ef4444"] },
  { id: "arctic",          name: "Arctic",           description: "Cool slate with icy blue.",             swatch: ["#0f1419", "#1e2731", "#7dd3fc"] },
  { id: "porcelain",       name: "Porcelain (Light)",description: "Bright neutral with cobalt accent.",    swatch: ["#f7f7f5", "#e8e6e1", "#2563eb"] },
];

export const DEFAULT_THEME_ID = "noir";

export function isLightTheme(id: string) {
  return id === "porcelain";
}

/* ---------------------------------------------------------------------
 *  Custom theme — user-picked primary + background colors.
 *  Applied as inline CSS custom properties on <html> (inline wins over the
 *  static [data-theme] rules). We derive the full ~20-token set from the two
 *  picks so the whole UI stays coherent, mirroring what each preset block does.
 * ------------------------------------------------------------------ */

export const CUSTOM_THEME_ID = "custom";

// Default colors for the custom theme when the user first selects it.
export const DEFAULT_CUSTOM_THEME = { primary: "#7c5cff", background: "#101014" };

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.length >= 6 ? h.slice(0, 6) : "000000", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToCss({ r, g, b }: RGB, alpha?: number) {
  const R = Math.round(Math.max(0, Math.min(255, r)));
  const G = Math.round(Math.max(0, Math.min(255, g)));
  const B = Math.round(Math.max(0, Math.min(255, b)));
  return alpha == null ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${alpha})`;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

// Perceived luminance (0–1) for choosing readable foregrounds.
function luminance({ r, g, b }: RGB): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Build the full design-token set (as inline CSS var strings) from two picks. */
export function buildCustomThemeVars(primaryHex: string, backgroundHex: string): Record<string, string> {
  const bg = hexToRgb(backgroundHex || DEFAULT_CUSTOM_THEME.background);
  const primary = hexToRgb(primaryHex || DEFAULT_CUSTOM_THEME.primary);
  const dark = luminance(bg) < 0.5;

  const white: RGB = { r: 255, g: 255, b: 255 };
  const black: RGB = { r: 10, g: 10, b: 12 };
  const fg = dark ? { r: 245, g: 245, b: 248 } : { r: 12, g: 12, b: 16 };
  const tint = dark ? white : black; // direction to lift surfaces toward

  const card = mix(bg, tint, 0.05);
  const popover = mix(bg, tint, 0.035);
  const secondary = mix(bg, fg, 0.12);
  const muted = mix(bg, fg, 0.12);
  const mutedFg = mix(fg, bg, 0.42);
  const accent = mix(primary, bg, 0.28);
  const primaryFg = luminance(primary) > 0.6 ? black : white;
  const input = mix(bg, fg, 0.14);

  return {
    "--radius": "1rem",
    "--background": rgbToCss(bg),
    "--foreground": rgbToCss(fg),
    "--card": rgbToCss(card),
    "--card-foreground": rgbToCss(fg),
    "--popover": rgbToCss(popover),
    "--popover-foreground": rgbToCss(fg),
    "--primary": rgbToCss(primary),
    "--primary-foreground": rgbToCss(primaryFg),
    "--secondary": rgbToCss(secondary),
    "--secondary-foreground": rgbToCss(fg),
    "--muted": rgbToCss(muted),
    "--muted-foreground": rgbToCss(mutedFg),
    "--accent": rgbToCss(accent),
    "--accent-foreground": rgbToCss(fg),
    "--destructive": "oklch(0.6 0.22 25)",
    "--destructive-foreground": rgbToCss(white),
    "--border": rgbToCss(fg, 0.16),
    "--input": rgbToCss(input),
    "--ring": rgbToCss(primary),
    "--glass": rgbToCss(card, 0.55),
    "--glass-border": rgbToCss(fg, 0.12),
    "--gradient-primary": `linear-gradient(135deg, ${rgbToCss(accent)}, ${rgbToCss(primary)})`,
    "--gradient-bg": `radial-gradient(ellipse at top, ${rgbToCss(mix(bg, primary, 0.18))} 0%, ${rgbToCss(bg)} 60%)`,
    "--shadow-glow": `0 10px 60px -10px ${rgbToCss(primary, 0.45)}`,
    "--shadow-glass": `0 8px 32px 0 ${rgbToCss(black, 0.5)}`,
  };
}

// Keys we set/clear on <html> so switching away from custom cleans up fully.
export const CUSTOM_THEME_VAR_KEYS = Object.keys(
  buildCustomThemeVars(DEFAULT_CUSTOM_THEME.primary, DEFAULT_CUSTOM_THEME.background),
);
