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
  videoId?: string;
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

// ---------- Invidious YouTube playlist import ----------
export function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

export async function importInvidiousPlaylist(input: string): Promise<{ name: string; tracks: Track[] } | null> {
  const plid = parsePlaylistId(input);
  if (!plid) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`/api/public/yt-playlist?id=${encodeURIComponent(plid)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const videos: any[] = data.videos || [];
      const tracks: Track[] = videos.map((v) => {
        const thumbs = v.videoThumbnails || [];
        const vid = v.videoId;
        // Invidious thumbnail URLs often point to the instance host (which may be
        // unreachable from the browser). Rebuild directly from YouTube's CDN.
        const art = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : (thumbs[0]?.url || "");
        const hi = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : art;
        const raw = String(v.title || "");
        const parts = raw.split(/\s+[-–—]\s+/);
        const artist = parts.length > 1 ? parts[0] : (v.author || "Unknown");
        const title = parts.length > 1 ? parts.slice(1).join(" - ") : raw;
        return {
          id: `yt:${v.videoId}`,
          title: title.replace(/\(official.*?\)|\[official.*?\]/i, "").trim() || raw,
          artist,
          artwork: art,
          artworkHi: hi,
          durationMs: (v.lengthSeconds || 0) * 1000,
          videoId: v.videoId,
        };
      }).filter((t) => t.videoId);
    if (!tracks.length) return null;
    return { name: data.title || "YouTube Playlist", tracks };
  } catch {
    return null;
  }
}

let invIdx = 0;
/**
 * Search YouTube via Invidious, biased toward auto-generated "- Topic" channels
 * (YouTube's official artist channels for music). Falls back to the most-viewed
 * non-Topic result if no Topic upload exists.
 */
export async function searchYouTube(query: string): Promise<string | null> {
  const enc = encodeURIComponent(`${query} topic`);
  for (let i = 0; i < INVIDIOUS_INSTANCES.length; i++) {
    const inst = INVIDIOUS_INSTANCES[(invIdx + i) % INVIDIOUS_INSTANCES.length];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${inst}/api/v1/search?q=${enc}&type=video&fields=videoId,title,author,viewCount,lengthSeconds`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        invIdx = (invIdx + i) % INVIDIOUS_INSTANCES.length;
        const topic = data.filter((v: any) => typeof v.author === "string" && /-\s*Topic\s*$/i.test(v.author));
        const pool = topic.length ? topic : data;
        let best = pool[0];
        for (const v of pool) if ((v.viewCount || 0) > (best.viewCount || 0)) best = v;
        return best.videoId;
      }
    } catch {
      // try next
    }
  }
  return null;
}

export type ArtistInfo = {
  name: string;
  sortName?: string;
  disambiguation?: string;
  type?: string;
  country?: string;
  foundedYear?: string;
  imageUrl?: string;
  imageUrlHi?: string;
  bio?: string;
  tags?: string[];
  listeners?: number;
  playCount?: number;
};

export async function fetchArtistInfo(artistName: string): Promise<ArtistInfo | null> {
  try {
    // MusicBrainz search for the artist
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=1`,
      { headers: { "User-Agent": "SleepyApp/1.0 (music-player)" } }
    );
    if (!mbRes.ok) return null;
    const mbData = await mbRes.json();
    const artist = mbData.artists?.[0];
    if (!artist) return null;

    const mbid = artist.id;
    let imageUrl: string | undefined;
    let imageUrlHi: string | undefined;

    // Fetch cover art from Cover Art Archive for the artist
    if (mbid) {
      try {
        const caaRes = await fetch(`https://coverartarchive.org/artist/${mbid}`, {
          headers: { "User-Agent": "SleepyApp/1.0 (music-player)" }
        });
        if (caaRes.ok) {
          const caaData = await caaRes.json();
          const img = caaData.images?.[0];
          if (img) {
            imageUrl = img.thumbnails?.["250"] || img.image;
            imageUrlHi = img.image;
          }
        }
      } catch { /* ignore */ }
    }

    // Get bio from Wikipedia via MusicBrainz url relations
    let bio: string | undefined;
    const wikiUrl = artist.relations?.find((r: any) => r.type === "wikipedia")?.url?.resource;
    if (!wikiUrl) {
      const wikidataId = artist.relations?.find((r: any) => r.type === "wikidata")?.url?.resource?.split("/").pop();
      if (wikidataId) {
        try {
          const wdRes = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`);
          if (wdRes.ok) {
            const wdData = await wdRes.json();
            const siteLinks = wdData.entities?.[wikidataId]?.sitelinks;
            const enWiki = siteLinks?.enwiki?.title;
            if (enWiki) {
              const wikiExtractRes = await fetch(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(enWiki)}`
              );
              if (wikiExtractRes.ok) {
                const wikiExtract = await wikiExtractRes.json();
                bio = wikiExtract.extract;
                imageUrl = imageUrl || wikiExtract.thumbnail?.source;
              }
            }
          }
        } catch { /* ignore */ }
      }
    } else {
      // Extract Wikipedia title and get extract
      const wikiTitle = wikiUrl.split("/wiki/").pop();
      if (wikiTitle) {
        try {
          const wikiExtractRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`
          );
          if (wikiExtractRes.ok) {
            const wikiExtract = await wikiExtractRes.json();
            bio = wikiExtract.extract;
            imageUrl = imageUrl || wikiExtract.thumbnail?.source;
          }
        } catch { /* ignore */ }
      }
    }

    // Parse life-span dates
    let foundedYear: string | undefined;
    if (artist["life-span"]?.begin) {
      foundedYear = artist["life-span"].begin.slice(0, 4);
    }

    // Get tags
    const tags = artist.tags?.map((t: any) => t.name).filter(Boolean).slice(0, 6) || [];

    return {
      name: artist.name,
      sortName: artist["sort-name"],
      disambiguation: artist.disambiguation,
      type: artist.type,
      country: artist.country,
      foundedYear,
      imageUrl,
      imageUrlHi,
      bio,
      tags,
    };
  } catch {
    return null;
  }
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
  try {
    const raw = JSON.parse(localStorage.getItem(LIKE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    // Dedupe by id and drop malformed entries (missing id/title) — those caused
    // "random" looking songs to appear in Liked.
    const seen = new Set<string>();
    return raw.filter((t: any) => {
      if (!t || !t.id || !t.title) return false;
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  } catch { return []; }
}
export function saveLiked(t: Track[]) {
  const seen = new Set<string>();
  const clean = t.filter((x) => {
    if (!x || !x.id || !x.title) return false;
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
  localStorage.setItem(LIKE_KEY, JSON.stringify(clean));
}