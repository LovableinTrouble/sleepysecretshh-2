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
