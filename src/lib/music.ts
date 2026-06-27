// Music utilities: iTunes search, Invidious YouTube lookup, lyrics fetch, playlist storage.

export type Track = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  artworkHi: string;
  previewUrl?: string;
  durationMs?: number;
  year?: number;
  genre?: string;
  trackUrl?: string;
};

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://inv.thepixora.com",
  "https://iv.melmac.space",
  "https://invidious.tiekoetter.com",
  "https://invidious.reallyaweso.me",
];

export async function searchITunes(q: string, limit = 14): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=${limit}`;
  const r = await fetch(url);
  const data = await r.json();
  return (data.results || [])
    .filter((x: any) => x.trackName && x.artistName)
    .map((x: any) => ({
      id: String(x.trackId),
      title: x.trackName,
      artist: x.artistName,
      album: x.collectionName,
      artwork: x.artworkUrl100,
      artworkHi: (x.artworkUrl100 || "").replace("100x100", "600x600"),
      previewUrl: x.previewUrl,
      durationMs: x.trackTimeMillis,
      year: x.releaseDate ? new Date(x.releaseDate).getFullYear() : undefined,
      genre: x.primaryGenreName,
      trackUrl: x.trackViewUrl,
    }));
}

// ---------- Recent searches ----------
const RECENT_KEY = "sleepy.music.recent.v1";
export function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
export function pushRecent(q: string) {
  const cur = loadRecent().filter(x => x.toLowerCase() !== q.toLowerCase());
  const next = [q, ...cur].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}
export function clearRecent() { localStorage.removeItem(RECENT_KEY); }

let invIdx = 0;
export async function searchYouTube(query: string): Promise<string | null> {
  const enc = encodeURIComponent(query);
  for (let i = 0; i < INVIDIOUS_INSTANCES.length; i++) {
    const inst = INVIDIOUS_INSTANCES[(invIdx + i) % INVIDIOUS_INSTANCES.length];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${inst}/api/v1/search?q=${enc}&type=video&fields=videoId,title,viewCount,lengthSeconds`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        invIdx = (invIdx + i) % INVIDIOUS_INSTANCES.length;
        let best = data[0];
        for (const v of data) if ((v.viewCount || 0) > (best.viewCount || 0)) best = v;
        return best.videoId;
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  // Try lrclib (plain) then lyrics.ovh
  try {
    const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(artist + " " + title)}`);
    if (r.ok) {
      const arr = await r.json();
      const hit = arr?.[0];
      if (hit?.plainLyrics) return hit.plainLyrics;
      if (hit?.id) {
        const r2 = await fetch(`https://lrclib.net/api/get/${hit.id}`);
        if (r2.ok) {
          const d = await r2.json();
          if (d.plainLyrics) return d.plainLyrics;
        }
      }
    }
  } catch {}
  try {
    const r = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    if (r.ok) {
      const d = await r.json();
      if (d.lyrics) return d.lyrics;
    }
  } catch {}
  return null;
}

// ---------- Playlists (localStorage) ----------

export type Playlist = { id: string; name: string; tracks: Track[]; createdAt: number };
const PL_KEY = "sleepy.music.playlists.v1";
const LIKE_KEY = "sleepy.music.liked.v1";

export function loadPlaylists(): Playlist[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PL_KEY) || "[]"); } catch { return []; }
}
export function savePlaylists(pls: Playlist[]) {
  localStorage.setItem(PL_KEY, JSON.stringify(pls));
}
export function loadLiked(): Track[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LIKE_KEY) || "[]"); } catch { return []; }
}
export function saveLiked(t: Track[]) {
  localStorage.setItem(LIKE_KEY, JSON.stringify(t));
}