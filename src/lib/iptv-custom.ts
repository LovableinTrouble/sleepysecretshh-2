import type { CuratedChannel } from "./iptv-curated";

const STORAGE_KEY = "iptv:custom-playlists";

export interface CustomPlaylist {
  id: string;
  name: string;
  source: string; // URL or "pasted"
  addedAt: number;
  channels: CuratedChannel[];
}

export function loadCustomPlaylists(): CustomPlaylist[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPlaylists(lists: CustomPlaylist[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    /* no-op */
  }
}

export function getCustomChannels(): CuratedChannel[] {
  return loadCustomPlaylists().flatMap((p) => p.channels);
}

/** Minimal M3U / M3U8 extended playlist parser. */
export function parseM3U(text: string, playlistName: string): CuratedChannel[] {
  const lines = text.split(/\r?\n/);
  const out: CuratedChannel[] = [];
  let pending: { name?: string; logo?: string; group?: string } | null = null;
  let idx = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTM3U")) continue;
    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");
      const attrs = comma > 0 ? line.slice(0, comma) : line;
      const name = comma > 0 ? line.slice(comma + 1).trim() : "Channel";
      const logo = /tvg-logo="([^"]+)"/i.exec(attrs)?.[1];
      const group = /group-title="([^"]+)"/i.exec(attrs)?.[1];
      pending = { name, logo, group };
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!/^https?:\/\//i.test(line)) continue;
    const meta = pending ?? {};
    pending = null;
    const name = meta.name || `Channel ${idx + 1}`;
    out.push({
      id: `custom-${playlistName.toLowerCase().replace(/\s+/g, "-")}-${idx}`,
      name,
      group: meta.group || playlistName,
      country: "—",
      logo: meta.logo,
      url: line,
    });
    idx++;
  }
  return out;
}

export async function fetchAndParsePlaylist(url: string, name: string): Promise<CuratedChannel[]> {
  // Proxy through our iptv-proxy to dodge CORS on the m3u itself.
  const b64 = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const proxied = `/api/public/iptv-proxy?u=${b64}&raw=1`;
  let text = "";
  try {
    const res = await fetch(proxied);
    if (res.ok) text = await res.text();
  } catch {
    /* no-op */
  }
  if (!text || !text.includes("#EXTINF")) {
    // Fallback: try direct (works if the host allows CORS).
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch playlist (HTTP ${res.status})`);
    text = await res.text();
  }
  if (!text.includes("#EXTINF")) throw new Error("This URL doesn't look like an M3U playlist.");
  return parseM3U(text, name);
}
