/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

type Input = {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
};

type ProviderHit = {
  downloads: DownloadItem[];
  subs: DownloadsResult["subtitles"];
};

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripTags(value: string): string {
  return htmlDecode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function attr(chunk: string, name: string): string {
  const match = chunk.match(new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i"));
  return match ? htmlDecode(match[1]) : "";
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function inferType(url: string): DownloadItem["type"] {
  const lower = url.toLowerCase();
  if (lower.startsWith("magnet:")) return "magnet";
  if (lower.includes(".torrent") || lower.includes("/torrent/")) return "torrent";
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes(".mkv")) return "mkv";
  if (lower.includes(".mp4")) return "mp4";
  return "file";
}

function qualityGuess(text: string): string {
  if (/2160|4k/i.test(text)) return "4K";
  if (/1080/i.test(text)) return "1080p";
  if (/720/i.test(text)) return "720p";
  if (/480/i.test(text)) return "480p";
  if (/3d/i.test(text)) return "3D";
  return "Auto";
}

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://exodus.desync.com:6969/announce",
];

function makeMagnet(infoHash: string, name: string): string {
  const params = new URLSearchParams({ xt: `urn:btih:${infoHash}`, dn: name });
  for (const tracker of TRACKERS) params.append("tr", tracker);
  return `magnet:?${params.toString()}`;
}

function toItem(url: string, source: string, label: string, quality?: string, size?: string): DownloadItem | null {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u) && !/^magnet:/i.test(u)) return null;
  const type = inferType(u);
  const baseName = safeFilename(label || source || "download");
  return {
    id: `${source}-${u}`,
    url: u,
    source,
    quality: quality || qualityGuess(`${label} ${u}`),
    type,
    size: size || undefined,
    fileName: type === "torrent" ? `${baseName}.torrent` : undefined,
  };
}

/** Normalize a title for exact-match comparison: lowercase, strip punctuation,
 *  collapse whitespace, remove common articles. */
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019'".,!?:;()\[\]{}]/g, "")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if a candidate title is a match for the requested title.
 *  Uses normalized comparison with prefix matching to avoid false positives
 *  like "Inception 2" matching "Inception", while still allowing quality/year
 *  suffixes like "Inception 2010 1080p" to match "Inception". */
function titleMatches(candidate: string, requested: string): boolean {
  const c = normalizeTitle(candidate);
  const r = normalizeTitle(requested);
  if (!c || !r) return false;
  if (c === r) return true;
  // Candidate must start with the full requested title.
  if (!c.startsWith(r + " ") && !c.startsWith(r)) return false;
  // Check that the word AFTER the requested title isn't a sequel number
  // or a different title word (e.g. "inception 2" should NOT match "inception").
  const after = c.slice(r.length).trim();
  if (after) {
    const nextWord = after.split(" ")[0];
    // Reject sequel-like patterns: "2", "3", "ii", "iii", "reboot", etc.
    if (/^(2|3|4|5|6|7|8|9|ii|iii|iv|v|vi|reboot|remake|sequel)$/.test(nextWord)) return false;
  }
  return true;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json,*/*",
      "user-agent": UA,
      ...(init?.headers || {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: "text/html,application/json,*/*",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
      referer: "https://dlhub.cc/",
      origin: "https://dlhub.cc",
      ...(init?.headers || {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

/* ============================================================
 * YTS provider — queries yts.mx API for direct .torrent files
 * and magnet links. Movies only.
 * ============================================================ */

async function providerYts(input: Input): Promise<ProviderHit | null> {
  if (input.type === "show") return null;
  try {
    const term = encodeURIComponent(input.title);
    const data = await fetchJson(`https://yts.mx/api/v2/list_movies.json?query_term=${term}&limit=20`);
    if (!data?.data?.movies?.length) return null;

    const downloads: DownloadItem[] = [];
    const seen = new Set<string>();

    for (const movie of data.data.movies) {
      // Use titleMatches to filter out wrong movies with similar names.
      if (!titleMatches(movie.title, input.title)) continue;
      if (input.year && movie.year && String(movie.year) !== String(input.year)) continue;
      for (const t of movie.torrents || []) {
        const quality = t.quality || "Auto";
        const size = t.size || "";
        const torrentUrl = t.url || "";
        const hash = t.hash || "";
        const name = `${movie.title} ${quality}`;
        // Emit .torrent file (user-visible download) …
        if (torrentUrl && !seen.has(torrentUrl)) {
          seen.add(torrentUrl);
          const item = toItem(torrentUrl, "YTS", name, quality, size);
          if (item) downloads.push(item);
        }
        // … and a magnet (used silently by WebTor source).
        if (hash) {
          const magnet = makeMagnet(hash, name);
          if (!seen.has(magnet)) {
            seen.add(magnet);
            const item = toItem(magnet, "YTS", name, quality, size);
            if (item) downloads.push(item);
          }
        }
      }
    }

    return downloads.length ? { downloads: downloads.slice(0, 10), subs: [] } : null;
  } catch {
    return null;
  }
}

/* ============================================================
 * DLHub provider — scrapes dlhub.cc search for direct download
 * file links (.torrent, magnet, and direct file URLs).
 * ============================================================ */

/** Parse DLHub search results by finding all download forms.
 *  Each form has hidden inputs for magnet, torrent_url, q, info_hash.
 *  The vname/qbadge/small elements appear in the surrounding variant div.
 *  We find each form, then search backwards for the vname/qbadge/small
 *  that precede it in the same variant block. */
function parseDlhub(html: string, requestedTitle: string): DownloadItem[] {
  const items: DownloadItem[] = [];

  // Find all download forms with their positions.
  const formRegex = /<form[^>]*action="\/download"[^>]*>[\s\S]*?<\/form>/gi;
  let formMatch: RegExpExecArray | null;

  while ((formMatch = formRegex.exec(html)) !== null) {
    const form = formMatch[0];
    const formStart = formMatch.index;

    // Skip JS template literals (they contain ${...} or esc() calls).
    if (form.includes("esc(") || form.includes("${")) continue;

    // Search backwards from the form for the nearest vname, qbadge, and small.
    const context = html.slice(Math.max(0, formStart - 500), formStart);

    const nameMatch = context.match(/<div class="vname">([\s\S]*?)<\/div>/i);
    const name = nameMatch ? stripTags(nameMatch[1]) : `Download`;

    // Filter by title when requested.
    if (requestedTitle && !titleMatches(name, requestedTitle)) continue;

    const qbadgeMatch = context.match(/<span class="qbadge">([\s\S]*?)<\/span>/i);
    const quality = qbadgeMatch ? stripTags(qbadgeMatch[1]) : qualityGuess(name);

    // Size appears after the qbadge — search in the context after qbadge.
    const smallMatch = context.match(/<span class="small">([\s\S]*?)<\/span>/i);
    const size = smallMatch ? stripTags(smallMatch[1]) : "";

    // Emit both magnet AND .torrent URL as separate items so the user
    // can download the .torrent file OR stream via WebTor.
    const magnet = attr(form, "magnet");
    const torrentUrl = attr(form, "torrent_url");
    const q = attr(form, "q");
    const direct = /^https?:\/\//i.test(q) ? q : "";

    if (torrentUrl) {
      const item = toItem(torrentUrl, "DLHub", name, quality, size);
      if (item) items.push(item);
    }
    if (magnet) {
      const item = toItem(magnet, "DLHub", `${name} (magnet)`, quality, size);
      if (item) items.push(item);
    }
    if (direct && direct !== torrentUrl) {
      const item = toItem(direct, "DLHub", name, quality, size);
      if (item) items.push(item);
    }
  }

  return items;
}

function dlhubQueries(input: Input): { q: string; source: string }[] {
  const title = input.title.trim();
  const year = input.year?.trim();
  if (input.type === "show") {
    const s = String(input.season ?? 1).padStart(2, "0");
    const e = String(input.episode ?? 1).padStart(2, "0");
    return [
      { q: `${title} S${s}E${e}`, source: "series" },
      { q: `${title} ${input.season ?? 1}x${input.episode ?? 1}`, source: "series" },
      { q: `${title} S${s}E${e}`, source: "all" },
    ];
  }
  return [
    ...(year ? [{ q: `${title} ${year}`, source: "movies" }] : []),
    { q: title, source: "movies" },
    ...(year ? [{ q: `${title} ${year}`, source: "all" }] : []),
  ];
}

async function providerDlhub(input: Input): Promise<ProviderHit | null> {
  const seen = new Set<string>();
  const downloads: DownloadItem[] = [];

  for (const query of dlhubQueries(input)) {
    const body = new URLSearchParams(query).toString();
    const html = await fetchText("https://dlhub.cc/search", { method: "POST", body }).catch(() => "");
    if (!html) continue;
    const parsed = parseDlhub(html, input.title);
    // If title matching filters everything out, fall back to unfiltered results
    // rather than returning nothing.
    const filtered = parsed.length > 0 ? parsed : parseDlhub(html, "");
    for (const item of filtered) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      downloads.push(item);
    }
    if (downloads.length >= 10) break;
  }

  return downloads.length ? { downloads: downloads.slice(0, 15), subs: [] } : null;
}

/* ============================================================
 * Vyla provider — optional, uses VYLA_API_KEY env var.
 * Returns direct download file links from Vyla API.
 * ============================================================ */

async function providerVyla(input: Input): Promise<ProviderHit | null> {
  let key: string | undefined;
  try {
    key = process.env.VYLA_API_KEY?.trim();
  } catch {
    return null;
  }
  if (!key) return null;

  const path =
    input.type === "show"
      ? `/api/downloads/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `/api/downloads/movie/${input.tmdbId}`;
  try {
    const res = await fetch(`https://api.vyla.cc${path}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json", "user-agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = Array.isArray(data?.downloads) ? data.downloads : [];
    const downloads = raw
      .map((d: any) =>
        toItem(
          String(d?.url || ""),
          "Vyla",
          `${input.title} ${d?.quality || ""}`,
          String(d?.quality || "Auto"),
          d?.size ? String(d.size) : undefined,
        ),
      )
      .filter(Boolean) as DownloadItem[];
    return downloads.length ? { downloads, subs: [] } : null;
  } catch {
    return null;
  }
}

/* ============================================================
 * Direct source providers — try to return playable mp4 / m3u8
 * URLs sourced from public TMDB-keyed embed APIs. When they
 * work, users get direct downloads instead of .torrent files.
 * ============================================================ */

async function providerAutoEmbed(input: Input): Promise<ProviderHit | null> {
  const bases = ["https://tom.autoembed.cc", "https://autoembed.cc"];
  const path =
    input.type === "show"
      ? `/api/getVideoSource?type=tv&id=${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `/api/getVideoSource?type=movie&id=${input.tmdbId}`;

  for (const base of bases) {
    try {
      const data = await fetchJson(`${base}${path}`);
      const sources: any[] = Array.isArray(data?.videoSource)
        ? data.videoSource
        : Array.isArray(data?.sources)
          ? data.sources
          : data?.url
            ? [{ url: data.url, quality: data.quality }]
            : [];
      const subs: DownloadsResult["subtitles"] = (Array.isArray(data?.subtitles) ? data.subtitles : [])
        .map((s: any) => ({
          url: String(s?.url || s?.file || ""),
          label: String(s?.label || s?.lang || s?.language || "Unknown"),
          language: String(s?.language || s?.lang || s?.label || ""),
          type: /\.vtt/i.test(String(s?.url || s?.file || "")) ? ("vtt" as const) : ("srt" as const),
        }))
        .filter((s: any) => s.url);
      const downloads: DownloadItem[] = [];
      for (const src of sources) {
        const url = String(src?.url || src?.file || "");
        if (!url) continue;
        const q = String(src?.quality || src?.label || qualityGuess(url));
        const item = toItem(url, "AutoEmbed", `${input.title} ${q}`, q);
        if (item) downloads.push(item);
      }
      if (downloads.length) return { downloads, subs };
    } catch {
      /* try next base */
    }
  }
  return null;
}

async function providerRgShows(input: Input): Promise<ProviderHit | null> {
  try {
    const url =
      input.type === "show"
        ? `https://api.rgshows.me/main/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
        : `https://api.rgshows.me/main/movie/${input.tmdbId}`;
    const data = await fetchJson(url);
    const stream = data?.stream;
    if (!stream?.url) return null;
    const item = toItem(String(stream.url), "RgShows", `${input.title} ${stream.quality || "Auto"}`, stream.quality);
    const subs: DownloadsResult["subtitles"] = (Array.isArray(stream.captions) ? stream.captions : [])
      .map((c: any) => ({
        url: String(c?.url || ""),
        label: String(c?.language || c?.label || "Unknown"),
        language: String(c?.language || ""),
        type: /\.vtt/i.test(String(c?.url || "")) ? ("vtt" as const) : ("srt" as const),
      }))
      .filter((c: any) => c.url);
    return item ? { downloads: [item], subs } : null;
  } catch {
    return null;
  }
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  try {
    // DLHub is the primary provider — it returns magnet links that work with WebTor.
    // AutoEmbed/RgShows provide direct streams. YTS is a fallback for movies.
    const providers = [providerDlhub, providerAutoEmbed, providerRgShows, providerYts, providerVyla];
    const results = await Promise.all(
      providers.map((fn) => Promise.resolve().then(() => fn(input)).catch(() => null)),
    );
    const downloads: DownloadItem[] = [];
    let subtitles: DownloadsResult["subtitles"] = [];
    const seen = new Set<string>();

    for (const hit of results) {
      if (!hit) continue;
      for (const item of hit.downloads) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        downloads.push(item);
      }
      if (!subtitles.length && hit.subs.length) subtitles = hit.subs;
    }

    return {
      ok: downloads.length > 0,
      downloads,
      subtitles,
      error: downloads.length ? undefined : "No downloads found for this title.",
    };
  } catch (e) {
    return {
      ok: false,
      downloads: [],
      subtitles: [],
      error: `Download resolver error: ${(e as Error)?.message || String(e)}`,
    };
  }
}
