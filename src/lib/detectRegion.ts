/* ============================================
   Region detection — ported from p-stream
   Picks the closest proxy/CDN region by IP geolocation.
   No zustand — uses sleepy's settings store + localStorage cache.
   ============================================ */

export type Region =
  | "auto"
  | "dallas"
  | "portland"
  | "new-york"
  | "paris"
  | "hong-kong"
  | "kansas"
  | "sydney"
  | "singapore"
  | "mumbai"
  | "unknown";

const REGION_COORDS: { region: Exclude<Region, "auto" | "unknown">; lat: number; lon: number; label: string }[] = [
  { region: "dallas", lat: 32.7767, lon: -96.797, label: "Dallas, US" },
  { region: "portland", lat: 45.5152, lon: -122.6784, label: "Portland, US" },
  { region: "new-york", lat: 40.7128, lon: -74.006, label: "New York, US" },
  { region: "paris", lat: 48.8566, lon: 2.3522, label: "Paris, FR" },
  { region: "hong-kong", lat: 22.3193, lon: 114.1694, label: "Hong Kong" },
  { region: "kansas", lat: 39.0997, lon: -94.5786, label: "Kansas City, US" },
  { region: "sydney", lat: -33.8688, lon: 151.2093, label: "Sydney, AU" },
  { region: "singapore", lat: 1.3521, lon: 103.8198, label: "Singapore" },
  { region: "mumbai", lat: 19.076, lon: 72.8777, label: "Mumbai, IN" },
];

export const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "auto", label: "Auto (detect closest)" },
  ...REGION_COORDS.map((r) => ({ value: r.region, label: r.label })),
];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function closestRegion(lat: number, lon: number): Region {
  let best: Region = "unknown";
  let min = Infinity;
  for (const r of REGION_COORDS) {
    const d = haversine(lat, lon, r.lat, r.lon);
    if (d < min) {
      min = d;
      best = r.region;
    }
  }
  return best;
}

const CACHE_KEY = "sleepy.region.v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  region: Region;
  ts: number;
}

function readCache(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CacheEntry;
    if (!v?.region || typeof v.ts !== "number") return null;
    return v;
  } catch {
    return null;
  }
}

function writeCache(region: Region) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ region, ts: Date.now() }));
  } catch {}
}

/**
 * Detect the closest region by IP geolocation. Honors a user override
 * passed via `userPicked` — that always wins. Falls back to cached value
 * on network failure.
 */
export async function detectRegion(userPicked?: Region): Promise<Region> {
  if (userPicked && userPicked !== "auto") return userPicked;

  const cached = readCache();
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.region;

  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (typeof data?.latitude === "number" && typeof data?.longitude === "number") {
      const region = closestRegion(data.latitude, data.longitude);
      writeCache(region);
      return region;
    }
  } catch {}

  try {
    const res = await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (typeof data?.loc === "string") {
      const [lat, lon] = data.loc.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const region = closestRegion(lat, lon);
        writeCache(region);
        return region;
      }
    }
  } catch {}

  return cached?.region ?? "unknown";
}
