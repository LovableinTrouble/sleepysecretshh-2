/* eslint-disable @typescript-eslint/no-explicit-any */
// Lightweight TMDB v3 client. Public read-access key baked in.
import { PUBLIC_TMDB_KEY, getSettings } from "./store";
import type { Media, MediaKind, Episode } from "./catalog";

const BASE = "https://api.themoviedb.org/3";
const IMG = (path: string | null, size = "w780") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : "";

function key() {
  const s = typeof window !== "undefined" ? getSettings() : null;
  return s?.tmdbApiKey && s.tmdbApiKey.length > 10 ? s.tmdbApiKey : PUBLIC_TMDB_KEY;
}

/** Are we allowed to surface adult / explicit content?
 *  Default OFF — must be explicitly enabled in Settings ("Show mature content").
 *  Server-side renders always return false (safe default during SSR). */
export function isMatureAllowed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(getSettings()?.matureContent);
  } catch {
    return false;
  }
}

/** TMDB romance/erotic genres we hide when mature content is disabled.
 *  10749 = Romance (often hides softcore/erotic films on TMDB). */
const NSFW_GENRE_IDS = new Set<number>([10749]);

function isSafeForMode(raw: any): boolean {
  if (isMatureAllowed()) return true;
  if (raw?.adult) return false;
  const ids: number[] = raw?.genre_ids || (raw?.genres ?? []).map((g: any) => g.id) || [];
  // Hide titles whose ONLY genre is the romance/erotic catch-all bucket
  // (keeps mainstream romance dramas visible — those have other genres too).
  if (ids.length === 1 && NSFW_GENRE_IDS.has(ids[0])) return false;
  const overview = String(raw?.overview || "").toLowerCase();
  if (/\b(explicit\s+sex|softcore|erotic(a)?|hardcore|porn|xxx)\b/.test(overview)) return false;
  return true;
}

async function tmdb<T = any>(
  path: string,
  params: Record<string, string | number | boolean> = {},
): Promise<T> {
  const u = new URL(BASE + path);
  u.searchParams.set("api_key", key());
  u.searchParams.set("language", "en-US");
  // Always force adult OFF at the request layer unless the user explicitly opted in.
  if (!isMatureAllowed() && !("include_adult" in params))
    u.searchParams.set("include_adult", "false");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

// ---------- Mappers ----------
const GENRE_CACHE: Record<string, Record<number, string>> = {};
async function genreMap(kind: "movie" | "tv") {
  if (GENRE_CACHE[kind]) return GENRE_CACHE[kind];
  const data = await tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${kind}/list`);
  const map: Record<number, string> = {};
  data.genres.forEach((g) => (map[g.id] = g.name));
  GENRE_CACHE[kind] = map;
  return map;
}

function toMedia(raw: any, kind: MediaKind, genres: Record<number, string>): Media {
  const isMovie =
    kind === "movie" || (kind !== "tv" && kind !== "anime" && raw.media_type === "movie");
  const title = raw.title || raw.name || "Untitled";
  const date = raw.release_date || raw.first_air_date || "";
  const ids: number[] = raw.genre_ids || raw.genres?.map((g: any) => g.id) || [];
  return {
    id: raw.id,
    type: kind,
    title,
    year: date ? date.slice(0, 4) : "—",
    rating: Math.round((raw.vote_average ?? 0) * 10) / 10,
    overview: raw.overview || "No overview available.",
    poster: IMG(raw.poster_path, "w500") || IMG(raw.backdrop_path, "w500"),
    backdrop: IMG(raw.backdrop_path, "original") || IMG(raw.poster_path, "original"),
    genres: ids
      .map((id) => genres[id])
      .filter(Boolean)
      .slice(0, 4),
    studios: (raw.production_companies || raw.networks || [])
      .map((c: any) => c.name)
      .filter(Boolean)
      .slice(0, 4),
    runtime: raw.runtime ? `${Math.floor(raw.runtime / 60)}h ${raw.runtime % 60}m` : undefined,
  };
}

// Filter out titles that haven't been released yet.
function isReleased(raw: any): boolean {
  const date = raw.release_date || raw.first_air_date;
  if (!date) return false;
  return new Date(date).getTime() <= Date.now();
}

// In-memory map of every media we've handed out (so openMedia by id works).
const SEEN = new Map<number, Media>();
function remember(list: Media[]) {
  const unique = Array.from(new Map(list.map((m) => [`${m.type}-${m.id}`, m])).values());
  unique.forEach((m) => SEEN.set(m.id, m));
  return unique;
}
export function rememberOne(m: Media) {
  SEEN.set(m.id, m);
  return m;
}
export function getRemembered(id: number) {
  return SEEN.get(id);
}

export interface ExtraDetails {
  tagline?: string;
  status?: string;
  originalLanguage?: string;
  originalTitle?: string;
  budget?: number;
  revenue?: number;
  homepage?: string;
  imdbId?: string;
  spokenLanguages?: string[];
  productionCountries?: string[];
  networks?: string[];
  createdBy?: string[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  firstAirDate?: string;
  lastAirDate?: string;
  releaseDate?: string;
  contentRating?: string;
  trailerKey?: string;
}

export async function fetchMediaById(id: number, kind: MediaKind): Promise<Media> {
  const path = kind === "movie" ? "movie" : "tv";
  const [raw, gm] = await Promise.all([
    tmdb<any>(`/${path}/${id}`),
    genreMap(path as "movie" | "tv"),
  ]);
  const m = toMedia(raw, kind, gm);
  SEEN.set(m.id, m);
  return m;
}

/** Rich details for the content page (tagline, status, budget, trailer, etc.). */
export async function fetchExtraDetails(id: number, kind: MediaKind): Promise<ExtraDetails> {
  const path = kind === "movie" ? "movie" : "tv";
  const [raw, videos, releases] = await Promise.all([
    tmdb<any>(`/${path}/${id}`),
    tmdb<{ results: any[] }>(`/${path}/${id}/videos`).catch(() => ({ results: [] })),
    kind === "movie"
      ? tmdb<{ results: any[] }>(`/movie/${id}/release_dates`).catch(() => ({ results: [] }))
      : tmdb<{ results: any[] }>(`/tv/${id}/content_ratings`).catch(() => ({ results: [] })),
  ]);
  const trailer = (videos.results || []).find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"),
  );
  let contentRating: string | undefined;
  if (kind === "movie") {
    const us = (releases.results || []).find((r: any) => r.iso_3166_1 === "US");
    contentRating = us?.release_dates?.find((d: any) => d.certification)?.certification;
  } else {
    const us = (releases.results || []).find((r: any) => r.iso_3166_1 === "US");
    contentRating = us?.rating;
  }
  return {
    tagline: raw.tagline || undefined,
    status: raw.status || undefined,
    originalLanguage: raw.original_language || undefined,
    originalTitle: raw.original_title || raw.original_name || undefined,
    budget: raw.budget || undefined,
    revenue: raw.revenue || undefined,
    homepage: raw.homepage || undefined,
    imdbId: raw.imdb_id || undefined,
    spokenLanguages: (raw.spoken_languages || [])
      .map((l: any) => l.english_name || l.name)
      .filter(Boolean),
    productionCountries: (raw.production_countries || []).map((c: any) => c.name).filter(Boolean),
    networks: (raw.networks || []).map((n: any) => n.name).filter(Boolean),
    createdBy: (raw.created_by || []).map((c: any) => c.name).filter(Boolean),
    numberOfSeasons: raw.number_of_seasons || undefined,
    numberOfEpisodes: raw.number_of_episodes || undefined,
    firstAirDate: raw.first_air_date || undefined,
    lastAirDate: raw.last_air_date || undefined,
    releaseDate: raw.release_date || undefined,
    contentRating: contentRating || undefined,
    trailerKey: trailer?.key,
  };
}

// ---------- Fetchers ----------
export async function fetchTrending(kind: "movie" | "tv" | "all" = "all"): Promise<Media[]> {
  const [d, mg, tg] = await Promise.all([
    tmdb<{ results: any[] }>(`/trending/${kind}/week`),
    genreMap("movie"),
    genreMap("tv"),
  ]);
  return remember(
    d.results
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => {
        const k: MediaKind = r.media_type === "tv" ? "tv" : "movie";
        return toMedia(r, k, k === "tv" ? tg : mg);
      }),
  );
}

export async function fetchPopular(kind: "movie" | "tv", pages = 3): Promise<Media[]> {
  const g = await genreMap(kind);
  const reqs = Array.from({ length: pages }, (_, i) =>
    tmdb<{ results: any[] }>(`/${kind}/popular`, { page: i + 1 }),
  );
  const all = (await Promise.all(reqs)).flatMap((r) => r.results);
  return remember(
    all
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => toMedia(r, kind, g)),
  );
}

export async function fetchTopRated(kind: "movie" | "tv", pages = 2): Promise<Media[]> {
  const g = await genreMap(kind);
  const reqs = Array.from({ length: pages }, (_, i) =>
    tmdb<{ results: any[] }>(`/${kind}/top_rated`, { page: i + 1 }),
  );
  const all = (await Promise.all(reqs)).flatMap((r) => r.results);
  return remember(
    all
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => toMedia(r, kind, g)),
  );
}

// Discover by genre id (movie or tv).
export async function fetchByGenre(
  kind: "movie" | "tv",
  genreId: number,
  pages = 1,
): Promise<Media[]> {
  const g = await genreMap(kind);
  const reqs = Array.from({ length: pages }, (_, i) =>
    tmdb<{ results: any[] }>(`/discover/${kind}`, {
      page: i + 1,
      with_genres: genreId,
      sort_by: "popularity.desc",
    }),
  );
  const all = (await Promise.all(reqs)).flatMap((r) => r.results);
  return remember(
    all
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => toMedia(r, kind, g)),
  );
}

// Now Playing / Upcoming / Airing Today helpers (light wrappers).
export async function fetchNowPlaying(): Promise<Media[]> {
  const g = await genreMap("movie");
  const d = await tmdb<{ results: any[] }>(`/movie/now_playing`);
  return remember(
    d.results
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => toMedia(r, "movie", g)),
  );
}
export async function fetchUpcoming(pages = 2): Promise<Media[]> {
  const g = await genreMap("movie");
  const reqs = Array.from({ length: pages }, (_, i) =>
    tmdb<{ results: any[] }>(`/movie/upcoming`, { page: i + 1 }),
  );
  const all = (await Promise.all(reqs)).flatMap((r) => r.results);
  // Only future-dated releases.
  return remember(
    all.filter((r) => r.poster_path && !isReleased(r)).map((r) => toMedia(r, "movie", g)),
  );
}
export async function fetchAiringToday(): Promise<Media[]> {
  const g = await genreMap("tv");
  const d = await tmdb<{ results: any[] }>(`/tv/airing_today`);
  return remember(
    d.results
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => toMedia(r, "tv", g)),
  );
}

// Anime Spotlight — actually trending anime RIGHT NOW.
// Strategy: merge TMDB's weekly TV trending list with the currently-airing
// Japanese animation feed, dedupe, and sort by TMDB popularity (which is
// rebuilt daily from views/searches/play counts). This reflects what people
// are watching *this week* — not an evergreen "popular all-time" leaderboard.
export async function fetchAnime(pages = 2): Promise<Media[]> {
  const g = await genreMap("tv");
  const [trendingPages, airingPages] = await Promise.all([
    Promise.all(
      Array.from({ length: pages }, (_, i) =>
        tmdb<{ results: any[] }>(`/trending/tv/week`, { page: i + 1 }),
      ),
    ),
    Promise.all(
      Array.from({ length: pages }, (_, i) =>
        tmdb<{ results: any[] }>(`/discover/tv`, {
          page: i + 1,
          with_genres: 16,
          with_original_language: "ja",
          sort_by: "popularity.desc",
          "air_date.gte": new Date(Date.now() - 1000 * 60 * 60 * 24 * 120)
            .toISOString()
            .slice(0, 10),
        }),
      ),
    ),
  ]);
  const trendingAnime = trendingPages
    .flatMap((r) => r.results)
    .filter(
      (r) => r.poster_path && r.original_language === "ja" && (r.genre_ids || []).includes(16),
    );
  const airing = airingPages.flatMap((r) => r.results);
  const merged = [...trendingAnime, ...airing]
    .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  return remember(merged.map((r) => toMedia(r, "anime", g)));
}

// Anime discovered by a specific TV genre (still Animation + Japanese).
export async function fetchAnimeByGenre(extraGenreId: number, pages = 1): Promise<Media[]> {
  const g = await genreMap("tv");
  const reqs = Array.from({ length: pages }, (_, i) =>
    tmdb<{ results: any[] }>(`/discover/tv`, {
      page: i + 1,
      with_genres: `16,${extraGenreId}`,
      with_original_language: "ja",
      sort_by: "popularity.desc",
    }),
  );
  const all = (await Promise.all(reqs)).flatMap((r) => r.results);
  return remember(
    all
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => toMedia(r, "anime", g)),
  );
}

export async function searchMulti(q: string): Promise<Media[]> {
  if (!q.trim()) return [];
  const [d, mg, tg] = await Promise.all([
    tmdb<{ results: any[] }>("/search/multi", { query: q, include_adult: isMatureAllowed() }),
    genreMap("movie"),
    genreMap("tv"),
  ]);
  return remember(
    d.results
      .filter(
        (r) =>
          r.poster_path &&
          (r.media_type === "movie" || r.media_type === "tv") &&
          isReleased(r) &&
          isSafeForMode(r),
      )
      .map((r) =>
        toMedia(r, r.media_type === "tv" ? "tv" : "movie", r.media_type === "tv" ? tg : mg),
      ),
  );
}

export interface PersonSearchResult {
  id: number;
  name: string;
  profile?: string;
  knownFor?: string;
  popularity?: number;
}

export async function searchPeople(q: string): Promise<PersonSearchResult[]> {
  if (!q.trim()) return [];
  const d = await tmdb<{ results: any[] }>("/search/person", {
    query: q,
    include_adult: isMatureAllowed(),
  });
  return (d.results || [])
    .filter((r: any) => r.profile_path)
    .slice(0, 24)
    .map((r: any) => ({
      id: r.id,
      name: r.name || "Unknown",
      profile: IMG(r.profile_path, "w185"),
      knownFor: (r.known_for || [])
        .map((k: any) => k.title || k.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(", "),
      popularity: r.popularity,
    }));
}

export async function fetchSimilar(media: Media): Promise<Media[]> {
  const tmdbKind = media.type === "movie" ? "movie" : "tv";
  const g = await genreMap(tmdbKind);
  const collect = (items: any[]) =>
    items.filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r));
  const [similar, recommendations] = await Promise.all([
    tmdb<{ results: any[] }>(`/${tmdbKind}/${media.id}/similar`).catch(() => ({ results: [] })),
    tmdb<{ results: any[] }>(`/${tmdbKind}/${media.id}/recommendations`).catch(() => ({
      results: [],
    })),
  ]);
  let results = collect([...similar.results, ...recommendations.results]);
  if (results.length < 6) {
    const genreIds = media.genres
      .map((name) => Number(Object.entries(g).find(([, value]) => value === name)?.[0]))
      .filter(Boolean);
    if (genreIds.length) {
      const fallback = await tmdb<{ results: any[] }>(`/discover/${tmdbKind}`, {
        with_genres: genreIds.slice(0, 2).join(","),
        sort_by: "popularity.desc",
        page: 1,
      }).catch(() => ({ results: [] }));
      results = [...results, ...collect(fallback.results).filter((r) => r.id !== media.id)];
    }
  }
  const unique = Array.from(new Map(results.map((r) => [r.id, r])).values()).slice(0, 12);
  return remember(unique.map((r) => toMedia(r, media.type, g)));
}

export async function fetchCredits(
  media: Media,
): Promise<{ id: number; name: string; role: string; img?: string }[]> {
  const tmdbKind = media.type === "movie" ? "movie" : "tv";
  const d = await tmdb<{ cast: any[] }>(`/${tmdbKind}/${media.id}/credits`);
  return (d.cast || []).slice(0, 18).map((person) => ({
    id: person.id,
    name: person.name || "Unknown",
    role: person.character || person.roles?.[0]?.character || "Cast",
    img: IMG(person.profile_path, "w185"),
  }));
}

export interface WatchProvider {
  id: number;
  name: string;
  logo: string;
  url?: string;
  access?: "Stream" | "Free" | "Rent" | "Buy";
}

export async function fetchCrew(
  media: Media,
): Promise<{ id: number; name: string; role: string; img?: string }[]> {
  const tmdbKind = media.type === "movie" ? "movie" : "tv";
  const d = await tmdb<{ crew: any[] }>(`/${tmdbKind}/${media.id}/credits`);
  const crew = d.crew || [];
  const directors = crew.filter((p) => p.job === "Director").slice(0, 2);
  const writers = crew.filter((p) => ["Writer", "Screenplay", "Story"].includes(p.job)).slice(0, 3);
  const producers = crew
    .filter((p) => p.job === "Producer" || p.job === "Executive Producer")
    .slice(0, 3);
  const composers = crew
    .filter((p) => p.job === "Original Music Composer" || p.job === "Music")
    .slice(0, 2);
  const cinematographers = crew.filter((p) => p.job === "Director of Photography").slice(0, 2);
  const editors = crew.filter((p) => p.job === "Editor").slice(0, 2);
  const seen = new Set<number>();
  const all = [
    ...directors,
    ...writers,
    ...producers,
    ...composers,
    ...cinematographers,
    ...editors,
  ];
  return all
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, role: p.job, img: IMG(p.profile_path, "w185") }));
}

export async function fetchWatchProviders(id: number, kind: MediaKind): Promise<WatchProvider[]> {
  const tmdbKind = kind === "movie" ? "movie" : "tv";
  const d = await tmdb<{ results: Record<string, any> }>(
    `/${tmdbKind}/${id}/watch/providers`,
  ).catch(() => ({ results: {} as Record<string, any> }));
  const us = d.results.US;
  const groups: Array<["Stream" | "Free" | "Rent" | "Buy", unknown[]]> = [
    ["Stream", us?.flatrate || []],
    ["Free", us?.free || us?.ads || []],
    ["Rent", us?.rent || []],
    ["Buy", us?.buy || []],
  ];
  const seen = new Set<number>();
  return groups
    .flatMap(([access, items]) =>
      items.map((p: any) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: IMG(p.logo_path, "w92"),
        url: us?.link,
        access,
      })),
    )
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 8);
}

export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownFor?: string;
  profile?: string;
  homepage?: string;
}

export async function fetchPerson(id: number): Promise<PersonDetails> {
  const d = await tmdb<any>(`/person/${id}`);
  return {
    id: d.id,
    name: d.name,
    biography: d.biography || "No biography available.",
    birthday: d.birthday || undefined,
    deathday: d.deathday || undefined,
    placeOfBirth: d.place_of_birth || undefined,
    knownFor: d.known_for_department || undefined,
    profile: IMG(d.profile_path, "h632"),
    homepage: d.homepage || undefined,
  };
}

export async function fetchPersonCredits(id: number): Promise<Media[]> {
  const [d, mg, tg] = await Promise.all([
    tmdb<{ cast: any[] }>(`/person/${id}/combined_credits`),
    genreMap("movie"),
    genreMap("tv"),
  ]);
  const seen = new Set<string>();
  const items = (d.cast || [])
    .filter((r) => r.poster_path && (r.media_type === "movie" || r.media_type === "tv"))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .filter((r) => {
      const k = `${r.media_type}-${r.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 24)
    .map((r) =>
      toMedia(r, r.media_type === "tv" ? "tv" : "movie", r.media_type === "tv" ? tg : mg),
    );
  return remember(items);
}

export async function fetchTvSeasonEpisodes(tvId: number, season: number): Promise<Episode[]> {
  const d = await tmdb<{ episodes: any[] }>(`/tv/${tvId}/season/${season}`);
  return (d.episodes || []).map((e) => ({
    number: e.episode_number,
    title: e.name || `Episode ${e.episode_number}`,
    overview: e.overview || "No description.",
    still: IMG(e.still_path, "w500"),
    runtime: e.runtime ? `${e.runtime}m` : "—",
  }));
}

export async function fetchTvDetails(tvId: number): Promise<{ seasons: { number: number }[] }> {
  const d = await tmdb<{ seasons: any[] }>(`/tv/${tvId}`);
  return {
    seasons: (d.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({ number: s.season_number })),
  };
}

// ---------- Streaming services (watch providers) ----------

export interface StreamingService {
  id: number; // TMDB provider id
  name: string;
  slug: string;
  logo: string; // remote logo URL
  accent: string; // brand color used for the tile
  blurb: string;
}

// Curated set of the biggest US-available subscription services.
// IDs match TMDB /watch/providers/* — verified against the public API.
export const STREAMING_SERVICES: StreamingService[] = [
  {
    id: 8,
    name: "Netflix",
    slug: "netflix",
    logo: "https://image.tmdb.org/t/p/original/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg",
    accent: "#E50914",
    blurb: "Originals, blockbusters, anime",
  },
  {
    id: 9,
    name: "Prime Video",
    slug: "prime-video",
    logo: "https://image.tmdb.org/t/p/original/emthp39XA2YScoYL1p0sdbAH2WA.jpg",
    accent: "#00A8E1",
    blurb: "Amazon originals and hit films",
  },
  {
    id: 337,
    name: "Disney+",
    slug: "disney-plus",
    logo: "https://image.tmdb.org/t/p/original/97yvRBw1GzX7fXprcF80er19ot.jpg",
    accent: "#0E2A56",
    blurb: "Disney, Pixar, Marvel, Star Wars",
  },
  {
    id: 1899,
    name: "Max",
    slug: "max",
    logo: "https://image.tmdb.org/t/p/original/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
    accent: "#002BE7",
    blurb: "HBO prestige TV and films",
  },
  {
    id: 15,
    name: "Hulu",
    slug: "hulu",
    logo: "https://image.tmdb.org/t/p/original/giwM8XX4V2AQb9vsoN7yti82tKK.jpg",
    accent: "#1CE783",
    blurb: "Next-day TV, FX and originals",
  },
  {
    id: 350,
    name: "Apple TV+",
    slug: "apple-tv",
    logo: "https://image.tmdb.org/t/p/original/peURlLlr8jggOwK53fJ5wdQl05y.jpg",
    accent: "#111111",
    blurb: "Apple's flagship originals",
  },
  {
    id: 531,
    name: "Paramount+",
    slug: "paramount",
    logo: "https://image.tmdb.org/t/p/original/h5DcR0J2EESLitnhR8xLG1QymTE.jpg",
    accent: "#0064FF",
    blurb: "Star Trek, Yellowstone, CBS hits",
  },
  {
    id: 386,
    name: "Peacock",
    slug: "peacock",
    logo: "https://image.tmdb.org/t/p/original/drPlq5beqXtBaP7MNs8W616YRhm.jpg",
    accent: "#000000",
    blurb: "NBC shows and Universal films",
  },
  {
    id: 387,
    name: "Peacock Premium",
    slug: "peacock-plus",
    logo: "https://image.tmdb.org/t/p/original/8VCV78prwd9QzZnEm0ReO6bERDa.jpg",
    accent: "#000000",
    blurb: "Ad-free Peacock catalog",
  },
  {
    id: 2,
    name: "Apple TV",
    slug: "apple-tv-store",
    logo: "https://image.tmdb.org/t/p/original/peURlLlr8jggOwK53fJ5wdQl05y.jpg",
    accent: "#1d1d1f",
    blurb: "Buy / rent on the iTunes store",
  },
  {
    id: 192,
    name: "YouTube",
    slug: "youtube",
    logo: "https://image.tmdb.org/t/p/original/qZE9Mp4dG2EOd2NLzWtINQs9YQt.jpg",
    accent: "#FF0000",
    blurb: "Movies on YouTube",
  },
  {
    id: 257,
    name: "fuboTV",
    slug: "fubo",
    logo: "https://image.tmdb.org/t/p/original/3IFsLzCxqyqzgmw3oRZdLQHbWFy.jpg",
    accent: "#FA4615",
    blurb: "Live TV and on-demand",
  },
];

export function getStreamingService(slug: string) {
  return STREAMING_SERVICES.find((s) => s.slug === slug);
}

/** Catalog for a streaming provider — combines movies + TV. */
export async function fetchByProvider(
  providerId: number,
  pages = 2,
  region = "US",
): Promise<Media[]> {
  const [mg, tg] = await Promise.all([genreMap("movie"), genreMap("tv")]);
  const movieReqs = Array.from({ length: pages }, (_, i) =>
    tmdb<{ results: any[] }>(`/discover/movie`, {
      page: i + 1,
      sort_by: "popularity.desc",
      with_watch_providers: providerId,
      watch_region: region,
    }).catch(() => ({ results: [] })),
  );
  const tvReqs = Array.from({ length: pages }, (_, i) =>
    tmdb<{ results: any[] }>(`/discover/tv`, {
      page: i + 1,
      sort_by: "popularity.desc",
      with_watch_providers: providerId,
      watch_region: region,
    }).catch(() => ({ results: [] })),
  );
  const [movies, tv] = await Promise.all([Promise.all(movieReqs), Promise.all(tvReqs)]);
  const allMovies = movies
    .flatMap((r) => r.results)
    .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
    .map((r) => toMedia(r, "movie", mg));
  const allTv = tv
    .flatMap((r) => r.results)
    .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
    .map((r) => toMedia(r, "tv", tg));
  // Interleave so the first row mixes movies + TV.
  const out: Media[] = [];
  const max = Math.max(allMovies.length, allTv.length);
  for (let i = 0; i < max; i++) {
    if (allMovies[i]) out.push(allMovies[i]);
    if (allTv[i]) out.push(allTv[i]);
  }
  return remember(out);
}

// Fetch videos (trailers, clips) for a movie
export async function fetchMovieVideos(
  movieId: number,
): Promise<{ key: string; type: string; site: string }[]> {
  try {
    const data = await tmdb<{ results: { key: string; type: string; site: string }[] }>(
      `/movie/${movieId}/videos`,
    );
    return data.results ?? [];
  } catch {
    return [];
  }
}

// Fetch videos (trailers, clips) for a TV show
export async function fetchTVVideos(
  tvId: number,
): Promise<{ key: string; type: string; site: string }[]> {
  try {
    const data = await tmdb<{ results: { key: string; type: string; site: string }[] }>(
      `/tv/${tvId}/videos`,
    );
    return data.results ?? [];
  } catch {
    return [];
  }
}

// Paginated feed used by /shorts for infinite scroll of trailer-worthy titles.
export async function fetchTrendingPage(
  kind: "movie" | "tv" | "all",
  page: number,
): Promise<Media[]> {
  const [d, mg, tg] = await Promise.all([
    tmdb<{ results: any[] }>(`/trending/${kind}/week`, { page }),
    genreMap("movie"),
    genreMap("tv"),
  ]);
  return remember(
    d.results
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => {
        const k: MediaKind = r.media_type === "tv" ? "tv" : "movie";
        return toMedia(r, k, k === "tv" ? tg : mg);
      }),
  );
}

export async function fetchPopularPage(kind: "movie" | "tv", page: number): Promise<Media[]> {
  const g = await genreMap(kind);
  const d = await tmdb<{ results: any[] }>(`/${kind}/popular`, { page });
  return remember(
    d.results
      .filter((r) => r.poster_path && isReleased(r) && isSafeForMode(r))
      .map((r) => toMedia(r, kind, g)),
  );
}
