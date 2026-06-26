// Live sports — thin client for the public ppv.to API.
// Endpoint: https://ppv.to/api/streams
// Each event ships with its own `iframe` embed URL — no per-event lookup.

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
}

export interface PpvCategory {
  category: string;
  id: number;
  always_live: boolean;
  streams: PpvEvent[];
}

// Routed through our own server proxy to avoid CORS / referrer issues with ppv.to.
const PROXY = "/api/ppv/streams";

export async function fetchPpvAll(): Promise<PpvCategory[]> {
  const r = await fetch(PROXY, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`ppv api ${r.status}`);
  const j = (await r.json()) as { success: boolean; streams?: PpvCategory[] };
  return j.streams ?? [];
}

export interface FlatEvent extends PpvEvent { category: string }

export function flattenEvents(cats: PpvCategory[]): FlatEvent[] {
  return cats.flatMap((c) => c.streams.map((s) => ({ ...s, category: c.category })));
}

export function isEventLive(e: PpvEvent, nowSec = Date.now() / 1000): boolean {
  if (e.always_live) return true;
  return e.starts_at <= nowSec && nowSec <= e.ends_at;
}

export function findEvent(cats: PpvCategory[], id: number): FlatEvent | undefined {
  for (const c of cats) {
    const s = c.streams.find((x) => x.id === id);
    if (s) return { ...s, category: c.category };
  }
  return undefined;
}
