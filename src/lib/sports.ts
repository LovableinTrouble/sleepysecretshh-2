// Live sports — thin client for the public ppv.to API.
// Endpoint: https://api.ppv.to/api/streams
// Each live event ships with its own `iframe` embed URL — no per-event lookup.

export interface PpvEvent {
  id: number;
  name: string;
  tag?: string;
  source_tag?: string;
  poster?: string;
  blurhash?: string;
  colors?: string[];
  uri_name: string;
  starts_at: number; // seconds
  ends_at: number;   // seconds
  always_live: 0 | 1;
  locale?: string;
  category_name: string;
  iframe: string;
  viewers?: string | number;
  substreams?: { id: number; name: string; iframe: string }[];
  allowpaststreams?: 0 | 1;
}

export interface PpvCategory {
  category: string;
  id: number;
  always_live: boolean;
  streams: PpvEvent[];
}

// Prefer our server proxy, then fall back to PPV's documented JSON hosts.
const PPV_ENDPOINTS = ["/api/ppv/streams", "https://api.ppv.to/api/streams", "https://api.ppv.st/api/streams"] as const;

export async function fetchPpvAll(): Promise<PpvCategory[]> {
  let lastError = "Could not load PPV streams";

  for (const endpoint of PPV_ENDPOINTS) {
    try {
      const r = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!r.ok) {
        lastError = `ppv api ${r.status}`;
        continue;
      }
      const j = (await r.json()) as { success?: boolean; streams?: PpvCategory[] };
      if (Array.isArray(j.streams)) return j.streams;
      lastError = "ppv api missing streams";
    } catch (e) {
      lastError = String((e as Error).message || e);
    }
  }

  throw new Error(lastError);
}

export interface FlatEvent extends PpvEvent { category: string }

export function isRealSportsCategory(category?: string): boolean {
  if (!category) return false;
  return !/24\s*\/\s*7/i.test(category);
}

export function normalizeIframeSrc(iframe?: string): string {
  const value = (iframe || "").trim();
  if (!value) return "";
  if (value.startsWith("<")) {
    const match = value.match(/\ssrc=(['"])(.*?)\1/i);
    return match?.[2]?.trim() || "";
  }
  return value;
}

export function hasPlayableIframe(e: Pick<PpvEvent, "iframe">): boolean {
  return /^https?:\/\//i.test(normalizeIframeSrc(e.iframe));
}

export function isEventLive(e: PpvEvent, nowSec = Date.now() / 1000): boolean {
  if (e.always_live) return true;
  return e.starts_at <= nowSec && nowSec <= e.ends_at;
}

export function isLiveSportsEvent(e: PpvEvent, category?: string, nowSec = Date.now() / 1000): boolean {
  return isRealSportsCategory(category || e.category_name) && isEventLive(e, nowSec) && hasPlayableIframe(e);
}

export function flattenEvents(cats: PpvCategory[]): FlatEvent[] {
  const now = Date.now() / 1000;
  return cats.flatMap((c) => {
    if (!isRealSportsCategory(c.category)) return [];
    return c.streams
      .map((s) => ({ ...s, category: c.category }))
      .filter((e) => isLiveSportsEvent(e, e.category, now));
  });
}

export function findEvent(cats: PpvCategory[], id: number): FlatEvent | undefined {
  const now = Date.now() / 1000;
  for (const c of cats) {
    if (!isRealSportsCategory(c.category)) continue;
    const s = c.streams.find((x) => x.id === id);
    if (s) {
      const event = { ...s, category: c.category };
      return isLiveSportsEvent(event, event.category, now) ? event : undefined;
    }
  }
  return undefined;
}
