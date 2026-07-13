// iptv-org client. The iptv-org API (https://iptv-org.github.io/api/) is a
// free, public, no-auth JSON dump of ~10k channels + ~30k streams + ~250
// countries. Files live on GitHub Pages and are 1–5 MB each, so we cache
// aggressively in memory and only re-fetch once a day unless that fails.
//
// We only emit *playable* channels — NSFW channels and anything in the
// upstream blocklist (`dmca` reasons only; `nsfw` is already filtered by
// is_nsfw) are dropped so they never reach the UI.

const API_BASE = "https://iptv-org.github.io/api";

const FETCH_TIMEOUT_MS = 12_000;
const TTL_FRESH_MS = 12 * 60 * 60 * 1000; // 12h fresh
const TTL_STALE_MS = 48 * 60 * 60 * 1000; // 48h stale-safe

export interface IptvOrgCountry {
  name: string;
  code: string;
  languages: string[];
  flag: string;
}

export interface IptvOrgGlobalChannel {
  id: string;
  name: string;
  country: string;
  countryName: string;
  flag: string;
  categories: string[];
  logo?: string;
  /** Best upstream stream the channel has, already chosen for the user. */
  stream: {
    url: string;
    title?: string;
    quality?: string;
    userAgent?: string;
    referrer?: string;
  };
  /** Other available streams (best one chosen above). For future "Switch source" UI. */
  streams: Array<{
    url: string;
    title?: string;
    quality?: string;
    label?: string;
    userAgent?: string;
    referrer?: string;
  }>;
}

interface RawCountry {
  name: string;
  code: string;
  languages: string[];
  flag: string;
}

interface RawChannel {
  id: string;
  name: string;
  alt_names?: string[];
  network?: string | null;
  owners?: string[];
  country: string;
  categories: string[];
  is_nsfw: boolean;
  launched?: string | null;
  closed?: string | null;
  replaced_by?: string | null;
  website?: string | null;
}

interface RawLogo {
  channel: string;
  feed: string | null;
  url: string;
}

interface RawStream {
  channel: string | null;
  feed: string | null;
  title: string;
  url: string;
  referrer: string | null;
  user_agent: string | null;
  quality: string | null;
  label: string | null;
}

interface RawBlocklistEntry {
  channel: string;
  reason: string;
  ref?: string;
}

// ── Per-endpoint caches ─────────────────────────────────────────────────────

type CacheEntry<T> = { data: T; fetchedAt: number };

const cache: {
  countries?: CacheEntry<RawCountry[]>;
  channels?: CacheEntry<RawChannel[]>;
  logos?: CacheEntry<RawLogo[]>;
  streams?: CacheEntry<RawStream[]>;
  blocklist?: CacheEntry<RawBlocklistEntry[]>;
} = {};

const inFlight: {
  countries?: Promise<RawCountry[]>;
  channels?: Promise<RawChannel[]>;
  logos?: Promise<RawLogo[]>;
  streams?: Promise<RawStream[]>;
  blocklist?: Promise<RawBlocklistEntry[]>;
} = {};

async function fetchJsonWithCache<T>(name: keyof typeof cache): Promise<T> {
  const now = Date.now();
  const c = cache[name];
  if (c && now - c.fetchedAt < TTL_FRESH_MS) return c.data;

  const prev = inFlight[name];
  if (prev) return prev as Promise<T>;

  const p = (async () => {
    const res = await fetch(`${API_BASE}/${name}.json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`iptv-org ${name} ${res.status}`);
    const data = (await res.json()) as T;
    cache[name] = { data, fetchedAt: Date.now() };
    return data;
  })();

  inFlight[name] = p as typeof inFlight[typeof name];
  try {
    return await p;
  } catch (err) {
    // Serve stale if we have something recent enough.
    if (c && now - c.fetchedAt < TTL_STALE_MS) {
      console.warn(`[iptv-org] ${name} fetch failed, serving stale`, err);
      return c.data;
    }
    throw err;
  } finally {
    delete inFlight[name];
  }
}

async function getCountries(): Promise<RawCountry[]> {
  return fetchJsonWithCache<RawCountry[]>("countries");
}

async function getChannels(): Promise<RawChannel[]> {
  return fetchJsonWithCache<RawChannel[]>("channels");
}

async function getLogos(): Promise<RawLogo[]> {
  return fetchJsonWithCache<RawLogo[]>("logos");
}

async function getStreams(): Promise<RawStream[]> {
  return fetchJsonWithCache<RawStream[]>("streams");
}

async function getBlocklist(): Promise<RawBlocklistEntry[]> {
  return fetchJsonWithCache<RawBlocklistEntry[]>("blocklist");
}

// ── Public API ──────────────────────────────────────────────────────────────

function isBlocked(channelId: string, blockMap: Set<string>): boolean {
  return blockMap.has(channelId);
}

function pickBestStream(streamsForChannel: RawStream[]): {
  best: RawStream;
  alternatives: RawStream[];
} {
  // Order by quality preference: 1080p >> 720p >> other >> undefined.
  // Stable: prefer the first occurrence at each tier.
  const score = (q: string | null | undefined): number => {
    const v = (q ?? "").toLowerCase();
    if (v.includes("1080")) return 4;
    if (v.includes("720")) return 3;
    if (v.includes("480")) return 2;
    if (v.length > 0) return 1;
    return 0;
  };
  const ranked = [...streamsForChannel].sort((a, b) => score(b.quality) - score(a.quality));
  return { best: ranked[0], alternatives: ranked.slice(1) };
}

export async function getGlobalCountries(): Promise<IptvOrgCountry[]> {
  const list = await getCountries();
  return list
    .filter((c) => c.code && c.name)
    .map((c) => ({
      name: c.name,
      code: c.code,
      languages: c.languages ?? [],
      flag: c.flag ?? "🌐",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGlobalChannelsByCountry(
  countryCode: string,
): Promise<IptvOrgGlobalChannel[]> {
  const code = (countryCode || "").trim().toUpperCase();
  if (!code) return [];

  const [allChannels, allLogos, allStreams, allBlocklist, allCountries] = await Promise.all([
    getChannels(),
    getLogos(),
    getStreams(),
    getBlocklist(),
    getCountries(),
  ]);

  const blockMap = new Set(
    allBlocklist.filter((b) => b.reason === "dmca").map((b) => b.channel),
  );

  const countryMeta =
    allCountries.find((c) => c.code.toUpperCase() === code) ?? null;

  // Build lookup maps for O(1) join. iptv-org's dataset is small enough to
  // hold in memory repeatedly (the upstream files are already cached).
  const logoByChannel = new Map<string, string>();
  for (const l of allLogos) {
    if (!l.url || l.feed) continue; // prefer channel-level logos over feed-specific
    if (!logoByChannel.has(l.channel)) logoByChannel.set(l.channel, l.url);
  }

  const streamsByChannel = new Map<string, RawStream[]>();
  for (const s of allStreams) {
    if (!s.channel || !s.url) continue;
    const arr = streamsByChannel.get(s.channel) ?? [];
    arr.push(s);
    streamsByChannel.set(s.channel, arr);
  }

  const out: IptvOrgGlobalChannel[] = [];
  for (const ch of allChannels) {
    if (!ch.id || !ch.name) continue;
    if ((ch.country || "").toUpperCase() !== code) continue;
    if (ch.is_nsfw) continue;
    if (ch.closed) continue; // channels with a "closed" date are dead
    if (isBlocked(ch.id, blockMap)) continue;

    const streamsForChannel = streamsByChannel.get(ch.id) ?? [];
    if (streamsForChannel.length === 0) continue; // no playable streams → skip
    const { best, alternatives } = pickBestStream(streamsForChannel);

    out.push({
      id: ch.id,
      name: ch.name,
      country: code,
      countryName: countryMeta?.name ?? code,
      flag: countryMeta?.flag ?? "🌐",
      categories: (ch.categories ?? []).filter(Boolean),
      logo: logoByChannel.get(ch.id),
      stream: {
        url: best.url,
        title: best.title || undefined,
        quality: best.quality || undefined,
        userAgent: best.user_agent || undefined,
        referrer: best.referrer || undefined,
      },
      streams: alternatives.map((s) => ({
        url: s.url,
        title: s.title || undefined,
        quality: s.quality || undefined,
        label: s.label || undefined,
        userAgent: s.user_agent || undefined,
        referrer: s.referrer || undefined,
      })),
    });
  }

  // Stable, friendly ordering: by name.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
