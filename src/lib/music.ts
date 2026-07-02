// Music utilities: iTunes search, Monochrome YouTube lookup, lyrics fetch, playlist storage.

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
  streamUrl?: string; // Direct audio stream URL from Monochrome
};

// Monochrome API base URL (proxied through our CORS handler)
const MONOCHROME_PROXY = "/api/public/monochrome-proxy";

/**
 * Monochrome API search result structure
 */
interface MonochromeSearchResult {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  duration?: number;
  thumbnail?: string;
  thumbnailUrl?: string;
  videoId?: string;
  streamUrl?: string;
}

/**
 * Search Monochrome API for music tracks
 */
export async function searchMonochrome(query: string, limit = 20): Promise<MonochromeSearchResult[]> {
  try {
    const endpoint = `/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(`${MONOCHROME_PROXY}?endpoint=${encodeURIComponent(endpoint)}`);
    if (!res.ok) return [];
    const data = await res.json();

    // Handle various response formats from Monochrome
    const items = Array.isArray(data) ? data : (data.results || data.items || []);
    return items;
  } catch (error) {
    console.error("Monochrome search error:", error);
    return [];
  }
}

/**
 * Get stream URL from Monochrome for a given video/track ID
 */
export async function getMonochromeStream(videoId: string): Promise<string | null> {
  try {
    const endpoint = `/stream/${videoId}`;
    const res = await fetch(`${MONOCHROME_PROXY}?endpoint=${encodeURIComponent(endpoint)}`);
    if (!res.ok) return null;
    const data = await res.json();

    // Return the stream URL if available
    if (data.url) return data.url;
    if (data.streamUrl) return data.streamUrl;
    if (data.audioUrl) return data.audioUrl;

    // Some APIs return the stream directly
    if (typeof data === "string" && data.startsWith("http")) return data;

    return null;
  } catch (error) {
    console.error("Monochrome stream error:", error);
    return null;
  }
}

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

// ---------- YouTube playlist import (kept for backward compatibility) ----------
export function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

export async function importMonochromePlaylist(input: string): Promise<{ name: string; tracks: Track[] } | null> {
  const plid = parsePlaylistId(input);
  if (!plid) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    // Try Monochrome playlist endpoint first
    const endpoint = `/playlist/${plid}`;
    const res = await fetch(`${MONOCHROME_PROXY}?endpoint=${encodeURIComponent(endpoint)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;

    const data = await res.json();
    const items: MonochromeSearchResult[] = data.tracks || data.videos || [];

    const tracks: Track[] = items.map((v) => {
      const artwork = v.thumbnail || v.thumbnailUrl ||
        (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` : "");
      return {
        id: v.id || `mono:${v.videoId || Date.now()}`,
        title: v.title || "Unknown",
        artist: Array.isArray(v.artists) ? v.artists.join(", ") : (v.artists || "Unknown"),
        album: v.album,
        artwork,
        artworkHi: artwork.replace(/mqdefault|hqdefault/, "hqdefault"),
        durationMs: v.duration ? v.duration * 1000 : undefined,
        videoId: v.videoId || v.id,
        streamUrl: v.streamUrl,
      };
    }).filter((t) => t.videoId);

    if (!tracks.length) return null;
    return { name: data.title || data.name || "Playlist", tracks };
  } catch {
    return null;
  }
}

let invIdx = 0;
/**
 * Search YouTube via Monochrome API for music videos.
 * Returns the best matching video ID.
 */
export async function searchYouTube(query: string): Promise<string | null> {
  try {
    const results = await searchMonochrome(`${query} topic`, 10);

    if (results.length > 0) {
      // Prefer results from Topic channels
      const topicResults = results.filter((r) =>
        r.artists?.some?.((a: string) => /-\s*Topic\s*$/i.test(a)) ||
        /-\s*Topic\s*$/i.test(r.title)
      );
      const best = topicResults[0] || results[0];
      return best.videoId || best.id;
    }
  } catch (error) {
    console.error("YouTube search error:", error);
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

export type ArtistSearchResult = {
  name: string;
  mbid: string;
  type?: string;
  country?: string;
  disambiguation?: string;
};

export async function searchArtists(query: string, limit = 10): Promise<ArtistSearchResult[]> {
  try {
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(query)}&fmt=json&limit=${limit}`,
      { headers: { "User-Agent": "SleepyApp/1.0 (music-player)" } }
    );
    if (!mbRes.ok) return [];
    const mbData = await mbRes.json();
    return (mbData.artists || []).map((a: any) => ({
      name: a.name,
      mbid: a.id,
      type: a.type,
      country: a.country,
      disambiguation: a.disambiguation,
    }));
  } catch {
    return [];
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