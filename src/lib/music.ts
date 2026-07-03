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
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://inv.thepixora.com",
  "https://iv.melmac.space",
];

// In-memory caches
const searchCache = new Map<string, any[]>();
const channelCache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = searchCache.get(key);
  if (entry && Date.now() - entry[0] < CACHE_TTL) {
    return entry[1] as T;
  }
  searchCache.delete(key);
  return null;
}

function setCached(key: string, value: any) {
  searchCache.set(key, [Date.now(), value]);
}

async function fetchWithTimeout(url: string, ms = 5000): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res;
  } catch {
    return null;
  }
}

/**
 * Search YouTube Music via Piped API (best for music content)
 */
export async function searchYouTubeMusic(query: string, limit = 30): Promise<{ videoId: string; title: string; artist: string; duration?: number; thumbnail?: string }[]> {
  const cacheKey = `search:${query}:${limit}`;
  const cached = getCached<any[]>(cacheKey);
  if (cached) return cached;

  const encoded = encodeURIComponent(query);

  // Try Piped instances first (better music results)
  for (const inst of PIPE_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${inst}/search?q=${encoded}&filter=music_songs`);
      if (!res?.ok) continue;
      const data = await res.json();
      if (data.items?.length) {
        const items = data.items.slice(0, limit).map((item: any) => ({
          videoId: item.url?.replace("/watch?v=", "") || item.id,
          title: item.title || item.name || "Unknown",
          artist: item.uploaderName || item.uploader || "Unknown",
          duration: item.duration,
          thumbnail: item.thumbnail || item.uploaderAvatar,
        })).filter((i: any) => i.videoId);
        if (items.length) {
          setCached(cacheKey, items);
          return items;
        }
      }
    } catch { continue; }
  }

  // Fallback to Invidious
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${inst}/api/v1/search?q=${encoded}&type=video`);
      if (!res?.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        // Prefer Topic channels
        const topics = data.filter((v: any) => v.author && /-\s*Topic\s*$/i.test(v.author));
        const pool = topics.length ? topics : data;
        const items = pool.slice(0, limit).map((v: any) => ({
          videoId: v.videoId,
          title: v.title,
          artist: v.author?.replace(/\s*-\s*Topic\s*$/i, "") || "Unknown",
          duration: v.lengthSeconds,
          thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        })).filter((i: any) => i.videoId);
        if (items.length) {
          setCached(cacheKey, items);
          return items;
        }
      }
    } catch { continue; }
  }

  return [];
}

/**
 * Search iTunes for music tracks (for metadata/artwork)
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

/**
 * Get artist albums from iTunes (for artist pages)
 */
export async function getArtistAlbums(artistName: string, limit = 50): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&media=music&entity=album&limit=${limit}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const albums = (data.results || [])
      .filter((x: any) => x.collectionName && x.artistName)
      .map((x: any) => ({
        id: String(x.collectionId),
        title: x.collectionName,
        artist: x.artistName,
        album: x.collectionName,
        artwork: x.artworkUrl100,
        artworkHi: (x.artworkUrl100 || "").replace("100x100", "600x600"),
        year: x.releaseDate ? new Date(x.releaseDate).getFullYear() : undefined,
        genre: x.primaryGenreName,
      }));
    return albums;
  } catch {
    return [];
  }
}

/**
 * Get songs from a specific artist
 */
export async function getArtistSongs(artistName: string, limit = 50): Promise<Track[]> {
  const ytResults = await searchYouTubeMusic(`${artistName} official`, limit);
  if (ytResults.length === 0) {
    // Fallback to iTunes
    return searchITunes(artistName, limit);
  }

  return ytResults.map((r, idx) => ({
    id: `yt:${r.videoId || idx}`,
    title: r.title,
    artist: r.artist,
    artwork: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`,
    artworkHi: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
    durationMs: (r.duration || 0) * 1000,
    videoId: r.videoId,
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
      const res = await fetchWithTimeout(`${inst}/playlists/${plid}`, 10000);
      if (!res?.ok) continue;
      const data = await res.json();
      const items = data.relatedStreams || data.videos || [];
      if (!items.length) continue;

      const tracks: Track[] = items.map((v: any, idx: number) => {
        const videoId = v.url?.replace("/watch?v=", "") || v.id;
        return {
          id: `yt:${videoId || idx}`,
          title: v.title || v.name || "Unknown",
          artist: v.uploaderName || v.uploader || "Unknown",
          artwork: v.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          artworkHi: v.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationMs: (v.duration || 0) * 1000,
          videoId,
        };
      }).filter((t: Track) => t.videoId);

      if (tracks.length) return { name: data.name || "Playlist", tracks };
    } catch { continue; }
  }

  // Fallback to Invidious
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${inst}/api/v1/playlists/${plid}`, 10000);
      if (!res?.ok) continue;
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
    } catch { continue; }
  }
  return null;
}

/**
 * Search for a YouTube video ID for a given track - with retries
 */
export async function searchYouTube(query: string): Promise<string | null> {
  const cacheKey = `videoId:${query}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const results = await searchYouTubeMusic(query, 3);
  const id = results[0]?.videoId || null;
  if (id) setCached(cacheKey, id);
  return id;
}

/**
 * Get genre-based recommendations with actual genre playlists
 */
export async function getGenreTracks(genre: string, limit = 100): Promise<Track[]> {
  const cacheKey = `genre:${genre}:${limit}`;
  const cached = getCached<Track[]>(cacheKey);
  if (cached) return cached;

  // Multiple queries to get more variety
  const genreQueries: Record<string, string[]> = {
    "Pop": ["pop hits 2024", "top pop songs", "pop music playlist", "best pop songs of all time"],
    "Hip-Hop": ["hip hop hits 2024", "rap music playlist", "trap music", "hip hop classics"],
    "R&B": ["r&b playlist", "rnb hits", "soul music playlist", "contemporary r&b"],
    "Rock": ["rock classics playlist", "alternative rock hits", "rock music 2024", "indie rock"],
    "Electronic": ["edm playlist 2024", "electronic dance music", "house music", "techno playlist"],
    "Indie": ["indie playlist 2024", "indie rock hits", "alternative indie", "indie folk"],
    "Country": ["country hits 2024", "country music playlist", "modern country", "country classics"],
    "K-Pop": ["kpop playlist 2024", "korean pop hits", "kpop mix", "k-pop playlist"],
    "Latin": ["latin hits 2024", "reggaeton playlist", "latin pop", "spanish music"],
    "Jazz": ["jazz playlist", "smooth jazz", "jazz classics", "modern jazz"],
    "Classical": ["classical music playlist", "orchestral music", "piano classics", "symphony"],
    "Lo-fi": ["lofi playlist", "chill beats study", "lofi hip hop", "chill lofi"],
  };

  const queries = genreQueries[genre] || [`${genre} music playlist`, `${genre} hits`];
  const allTracks: Track[] = [];
  const seen = new Set<string>();

  // Run multiple searches in parallel for speed
  const searchPromises = queries.map(q => searchYouTubeMusic(q, Math.ceil(limit / queries.length)));
  const results = await Promise.all(searchPromises);

  for (const ytResults of results) {
    for (const r of ytResults) {
      if (!r.videoId || seen.has(r.videoId)) continue;
      seen.add(r.videoId);
      allTracks.push({
        id: `yt:${r.videoId}`,
        title: r.title,
        artist: r.artist,
        artwork: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`,
        artworkHi: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
        durationMs: (r.duration || 0) * 1000,
        videoId: r.videoId,
        genre,
      });
    }
  }

  if (allTracks.length) setCached(cacheKey, allTracks);
  return allTracks.slice(0, limit);
}

/**
 * Get artist radio - mix of artist songs and similar artists
 */
export async function getArtistRadio(artistName: string, limit = 50): Promise<Track[]> {
  const cacheKey = `radio:${artistName}:${limit}`;
  const cached = getCached<Track[]>(cacheKey);
  if (cached) return cached;

  // Search in parallel for speed
  const queries = [
    `${artistName}`,
    `${artistName} greatest hits`,
    `${artistName} best songs`,
  ];

  const allTracks: Track[] = [];
  const seen = new Set<string>();

  const searchPromises = queries.map(q => searchYouTubeMusic(q, Math.ceil(limit / queries.length)));
  const results = await Promise.all(searchPromises);

  for (const ytResults of results) {
    for (const r of ytResults) {
      if (!r.videoId || seen.has(r.videoId)) continue;
      seen.add(r.videoId);
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

  if (allTracks.length) setCached(cacheKey, allTracks);
  return allTracks.slice(0, limit);
}

// ---------- Artist Info ----------
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

    // Get Wikipedia image
    const wikiUrl = artist.relations?.find((r: any) => r.type === "wikipedia")?.url?.resource;
    if (wikiUrl) {
      const wikiTitle = wikiUrl.split("/wiki/").pop();
      if (wikiTitle) {
        try {
          const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`);
          if (wikiRes.ok) {
            const wikiData = await wikiRes.json();
            imageUrl = wikiData.thumbnail?.source;
          }
        } catch {}
      }
    }

    let foundedYear: string | undefined;
    if (artist["life-span"]?.begin) {
      foundedYear = artist["life-span"].begin.slice(0, 4);
    }

    const tags = artist.tags?.map((t: any) => t.name).filter(Boolean).slice(0, 6) || [];

    return {
      name: artist.name,
      sortName: artist["sort-name"],
      disambiguation: artist.disambiguation,
      type: artist.type,
      country: artist.country,
      foundedYear,
      imageUrl,
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

// ---------- Lyrics ----------
export async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  try {
    const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(artist + " " + title)}`);
    if (r.ok) {
      const arr = await r.json();
      if (arr?.[0]?.plainLyrics) return arr[0].plainLyrics;
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
