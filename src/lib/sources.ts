import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — FebBox is the primary direct source (up to 4K, requires
 * a ui= cookie). Xpass (play.xpass.top / Pobreflix) is the direct HLS
 * backup, resolved server-side and streamed through our own proxy so playback
 * uses our native player UI. No third-party embeds.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "febbox-direct" | "xpass-direct";
  tier: "primary" | "backup";
  legacy?: boolean;
  build: (m: Media, season?: number, episode?: number) => string;
}

export type SourceKey = "gamma" | "xpass";

const FEBBOX: Source = {
  id: "febbox",
  name: "FebBox",
  badge: "Direct · up to 4K",
  kind: "febbox-direct",
  tier: "primary",
  build: () => "",
};

// Xpass — direct HLS backup, resolved server-side via `resolveXpassStream`.
const XPASS: Source = {
  id: "xpass",
  name: "Xpass",
  badge: "Direct · HLS",
  kind: "xpass-direct",
  tier: "backup",
  build: () => "",
};

export const SOURCES: Source[] = [FEBBOX, XPASS];

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, XPASS] : [XPASS, FEBBOX];
}

export function sourceForKey(key: SourceKey): Source {
  return key === "gamma" ? FEBBOX : XPASS;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  gamma: "FebBox",
  xpass: "Xpass",
};
