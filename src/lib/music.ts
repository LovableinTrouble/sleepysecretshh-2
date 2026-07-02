// Music utilities: iTunes search, YouTube Music via Piped/Invidious, lyrics, playlists.

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

// Piped/Invidious instances for YouTube Music search
const PIPE_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.r4fo.com",
  "https://api.piped.yt",
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://inv.thepixora.com",
  "https://iv.melmac.space",
  "https://invidious.tiekoetter.com",
];

export type YtSearchResult = { videoId: string; title: string; artist: string; duration?: number; thumbnail?: string };

// ---------- In-memory caches (per session) ----------
// Avoids re-hitting flaky public Invidious/Piped instances for repeated queries.
const RESULTS_CACHE = new Map<string, YtSearchResult[]>();
const VIDEOID_CACHE = new Map<string, string | null>();
const PREVIEW_CACHE = new Map<string, string | null>();

// Public instances are frequently slow/down — keep the per-request budget tight
// and race instances in parallel instead of waiting on each sequentially.
const PER_INSTANCE_TIMEOUT = 4000;

async function fetchJson(url: string, timeout = PER_INSTANCE_TIMEOUT): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Resolve with the first task that produces a non-empty result; null if all fail.
async function raceFirst<T>(tasks: Array<() => Promise<T>>, isValid: (v: T) => boolean): Promise<T | null> {
  if (!tasks.length) return null;
  try {
    return await Promise.any(
      tasks.map(async (task) => {
        const v = await task();
        if (!isValid(v)) throw new Error("empty");
        return v;
      }),
    );
  } catch {
    return null;
  }
}

/**
 * Search YouTube Music via Piped (preferred) then Invidious. Instances within
 * each pool are raced in parallel with a short timeout, and results are cached.
 */
export async function searchYouTubeMusic(query: string, limit = 20): Promise<YtSearchResult[]> {
  const cacheKey = `${query}::${limit}`;
  const cached = RESULTS_CACHE.get(cacheKey);
  if (cached) return cached;

  const encoded = encodeURIComponent(query);

  // Piped instances first (better music metadata) — raced in parallel.
  const piped = await raceFirst<YtSearchResult[]>(
    PIPE_INSTANCES.map((inst) => async () => {
      const data = await fetchJson(`${inst}/search?q=${encoded}&filter=music_songs`);
      const items: any[] = data?.items ?? [];
      if (!Array.isArray(items) || !items.length) return [];
      return items.slice(0, limit).map((item: any) => ({
        videoId: item.url?.replace("/watch?v=", "") || item.id,
        title: item.title || item.name,
        artist: item.uploaderName || item.uploader || "Unknown",
        duration: item.duration,
        thumbnail: item.thumbnail || item.uploaderAvatar,
      }));
    }),
    (r) => Array.isArray(r) && r.length > 0,
  );
  if (piped && piped.length) {
    RESULTS_CACHE.set(cacheKey, piped);
    return piped;
  }

  // Invidious fallback — also raced in parallel.
  const invidious = await raceFirst<YtSearchResult[]>(
    INVIDIOUS_INSTANCES.map((inst) => async () => {
      const data = await fetchJson(`${inst}/api/v1/search?q=${encodeURIComponent(query + " topic")}&type=video`);
      if (!Array.isArray(data) || !data.length) return [];
      const topicResults = data.filter((v: any) => v.author && /-\s*Topic\s*$/i.test(v.author));
      const pool = topicResults.length ? topicResults : data;
      return pool.slice(0, limit).map((v: any) => ({
        videoId: v.videoId,
        title: v.title,
        artist: v.author?.replace(/\s*-\s*Topic\s*$/i, "") || "Unknown",
        duration: v.lengthSeconds,
        thumbnail: v.videoThumbnails?.[0]?.url,
      }));
    }),
    (r) => Array.isArray(r) && r.length > 0,
  );
  if (invidious && invidious.length) {
    RESULTS_CACHE.set(cacheKey, invidious);
    return invidious;
  }

  return [];
}

/**
 * Search iTunes for music tracks
 */
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

// ---------- Playlist import ----------
export function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

export async function importYouTubePlaylist(input: string): Promise<{ name: string; tracks: Track[] } | null> {
  const plid = parsePlaylistId(input);
  if (!plid) return null;

  // Try Piped playlist endpoint
  for (const inst of PIPE_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${inst}/playlists/${plid}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.relatedStreams?.length && !data.videos?.length) continue;

      const items = data.relatedStreams || data.videos || [];
      const tracks: Track[] = items.map((v: any, idx: number) => ({
        id: `yt:${v.url?.replace("/watch?v=", "") || v.id || idx}`,
        title: v.title || v.name || "Unknown",
        artist: v.uploaderName || v.uploader || "Unknown",
        artwork: v.thumbnail || `https://i.ytimg.com/vi/${v.url?.replace("/watch?v=", "")}/mqdefault.jpg`,
        artworkHi: v.thumbnail || `https://i.ytimg.com/vi/${v.url?.replace("/watch?v=", "")}/hqdefault.jpg`,
        durationMs: (v.duration || 0) * 1000,
        videoId: v.url?.replace("/watch?v=", "") || v.id,
      })).filter((t: Track) => t.videoId);

      if (tracks.length) {
        return { name: data.name || "Playlist", tracks };
      }
    } catch (e) {
      console.debug(`Piped playlist ${inst} failed:`, e);
    }
  }

  // Fallback to Invidious
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${inst}/api/v1/playlists/${plid}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.videos?.length) continue;

      const tracks: Track[] = data.videos.map((v: any) => ({
        id: `yt:${v.videoId}`,
        title: v.title || "Unknown",
        artist: v.author || "Unknown",
        artwork: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        artworkHi: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        durationMs: (v.lengthSeconds || 0) * 1000,
        videoId: v.videoId,
      }));

      return { name: data.title || "Playlist", tracks };
    } catch (e) {
      console.debug(`Invidious playlist ${inst} failed:`, e);
    }
  }
  return null;
}

/**
 * Search for a YouTube video ID for a given track (cached).
 */
export async function searchYouTube(query: string): Promise<string | null> {
  if (VIDEOID_CACHE.has(query)) return VIDEOID_CACHE.get(query) ?? null;
  const results = await searchYouTubeMusic(query, 5);
  const id = results[0]?.videoId || null;
  VIDEOID_CACHE.set(query, id);
  return id;
}

/**
 * Audible fallback: resolve a 30s iTunes preview URL for a query when every
 * Invidious/Piped instance is down, so the player still plays *something*.
 */
export async function searchTrackPreview(query: string): Promise<string | null> {
  if (PREVIEW_CACHE.has(query)) return PREVIEW_CACHE.get(query) ?? null;
  let url: string | null = null;
  try {
    const tracks = await searchITunes(query, 1);
    url = tracks[0]?.previewUrl || null;
  } catch {
    url = null;
  }
  PREVIEW_CACHE.set(query, url);
  return url;
}

/**
 * Get genre-based recommendations by searching for genre-specific terms
 */
export async function getGenreTracks(genre: string, limit = 25): Promise<Track[]> {
  const genreQueries: Record<string, string> = {
    "Pop": "pop hits 2024 top charts",
    "Hip-Hop": "hip hop rap trending",
    "R&B": "r&b soul music",
    "Rock": "rock classics alternative",
    "Electronic": "electronic dance edm",
    "Indie": "indie alternative rock",
    "Country": "country music hits",
    "K-Pop": "kpop korean pop",
    "Latin": "latin reggaeton hits",
    "Jazz": "jazz smooth classics",
    "Classical": "classical music orchestra",
    "Lo-fi": "lofi chill beats study",
  };

  const searchQuery = genreQueries[genre] || `${genre} music`;
  const ytResults = await searchYouTubeMusic(searchQuery, limit);

  const tracks: Track[] = ytResults.map((r, idx) => ({
    id: `yt:${r.videoId || idx}`,
    title: r.title,
    artist: r.artist,
    artwork: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`,
    artworkHi: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
    durationMs: (r.duration || 0) * 1000,
    videoId: r.videoId,
    genre,
  }));

  return tracks;
}

/**
 * Get artist radio - similar artists and their top tracks
 */
export async function getArtistRadio(artistName: string, limit = 25): Promise<Track[]> {
  // Search for artist's top songs + similar artist songs
  const queries = [
    `${artistName} greatest hits`,
    `${artistName} best songs`,
    `similar to ${artistName}`,
  ];

  const allTracks: Track[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    const results = await searchYouTubeMusic(q, 10);
    for (const r of results) {
      const key = r.videoId || r.title;
      if (seen.has(key)) continue;
      seen.add(key);
      allTracks.push({
        id: `yt:${r.videoId}`,
        title: r.title,
        artist: r.artist,
        artwork: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`,
        artworkHi: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
        durationMs: (r.duration || 0) * 1000,
        videoId: r.videoId,
      });
    }
  }

  return allTracks.slice(0, limit);
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
    // MusicBrainz search for the artist (type: group OR person, exclude "person" for cleaner results)
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(artistName)}%20AND%20(type:group%20OR%20type:orchestra%20OR%20type:choir)&fmt=json&limit=1`,
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
  imageUrl?: string;
};

export async function searchArtists(query: string, limit = 10): Promise<ArtistSearchResult[]> {
  try {
    // Search for groups/orchestras/choirs only - NOT individual people
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(query)}%20AND%20(type:group%20OR%20type:orchestra%20OR%20type:choir%20OR%20type:other)&fmt=json&limit=${limit}`,
      { headers: { "User-Agent": "SleepyApp/1.0 (music-player)" } }
    );
    if (!mbRes.ok) return [];
    const mbData = await mbRes.json();
    return (mbData.artists || [])
      .filter((a: any) => a.type !== "Person") // Extra safety: exclude persons
      .map((a: any) => ({
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
