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

function toItem(url: string, source: string, label: string, quality?: string, size?: string): DownloadItem | null {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  const type = inferType(u);
  // We only expose direct file downloads + .torrent files — no magnets.
  if (type === "file" && u.startsWith("magnet:")) return null;
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
    const data = await fetchJson(`https://yts.mx/api/v2/list_movies.json?query_term=${term}&limit=5`);
    if (!data?.data?.movies?.length) return null;

    const downloads: DownloadItem[] = [];
    const seen = new Set<string>();

    for (const movie of data.data.movies) {
      if (input.year && movie.year && String(movie.year) !== String(input.year)) continue;
      for (const t of movie.torrents || []) {
        const quality = t.quality || "Auto";
        const size = t.size || "";
        const torrentUrl = t.url || "";
        const name = `${movie.title} ${quality}`;
        const url = torrentUrl;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const item = toItem(url, "YTS", name, quality, size);
        if (item) downloads.push(item);
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

function parseDlhub(html: string): DownloadItem[] {
  const items: DownloadItem[] = [];
  const chunks = html.match(/<div class="variant[^"]*"[\s\S]*?<form[\s\S]*?<\/form>[\s\S]*?<\/div>/gi) || [];

  for (const chunk of chunks) {
    const name = stripTags(chunk.match(/<div class="vname">([\s\S]*?)<\/div>/i)?.[1] || "Download");
    const quality = stripTags(chunk.match(/<span class="qbadge">([\s\S]*?)<\/span>/i)?.[1] || qualityGuess(name));
    const afterQuality = chunk.split(/<span class="qbadge">[\s\S]*?<\/span>/i)[1] || chunk;
    const size = stripTags(afterQuality.match(/<span class="small">([\s\S]*?)<\/span>/i)?.[1] || "");
    const torrentUrl = attr(chunk, "torrent_url");
    const q = attr(chunk, "q");
    const direct = /^https?:\/\//i.test(q) ? q : "";
    const url = direct || torrentUrl;
    const item = toItem(url, "DLHub", name, quality, size);
    if (item) items.push(item);
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
    for (const item of parseDlhub(html)) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      downloads.push(item);
    }
    if (downloads.length >= 8) break;
  }

  return downloads.length ? { downloads: downloads.slice(0, 12), subs: [] } : null;
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
 * 1337x provider — scrapes 1337x search for torrent/magnet links.
 * Works for both movies and TV shows.
 * ============================================================ */

async function provider1337x(input: Input): Promise<ProviderHit | null> {
  try {
    const title = input.title.trim();
    let query = title;
    if (input.type === "show") {
      const s = String(input.season ?? 1).padStart(2, "0");
      const e = String(input.episode ?? 1).padStart(2, "0");
      query = `${title} S${s}E${e}`;
    } else if (input.year) {
      query = `${title} ${input.year}`;
    }

    const searchUrl = `https://1337x.to/search/${encodeURIComponent(query)}/1/`;
    const html = await fetchText(searchUrl, {
      headers: { "user-agent": UA, referer: "https://1337x.to/" },
    }).catch(() => "");
    if (!html) return null;

    const downloads: DownloadItem[] = [];
    const seen = new Set<string>();

    const rowRegex = /<a href="(https:\/\/1337x\.to\/torrent\/\d+\/[^"]+)"[^>]*class="[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = rowRegex.exec(html)) !== null && downloads.length < 8) {
      const detailUrl = match[1];
      const name = stripTags(match[2]);
      if (seen.has(detailUrl)) continue;
      seen.add(detailUrl);

      const detailHtml = await fetchText(detailUrl, {
        headers: { "user-agent": UA, referer: "https://1337x.to/" },
      }).catch(() => "");
      if (!detailHtml) continue;

      const magnetMatch = detailHtml.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/i);
      const sizeMatch = detailHtml.match(/<strong>([\d.]+\s*[KMGT]B)<\/strong>/i);
      if (magnetMatch) {
        const item = toItem(magnetMatch[1], "1337x", name, qualityGuess(name), sizeMatch?.[1]);
        if (item) downloads.push(item);
      }
    }

    return downloads.length ? { downloads, subs: [] } : null;
  } catch {
    return null;
  }
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  try {
    const providers = [providerYts, providerDlhub, provider1337x, providerVyla];
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
