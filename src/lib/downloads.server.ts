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

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://exodus.desync.com:6969/announce",
];

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
    signal: AbortSignal.timeout(14000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

function parseDlhub(html: string): DownloadItem[] {
  const items: DownloadItem[] = [];
  const chunks = html.match(/<div class="variant[^"]*"[\s\S]*?<form[\s\S]*?<\/form>[\s\S]*?<\/div>/gi) || [];

  for (const chunk of chunks) {
    const name = stripTags(chunk.match(/<div class="vname">([\s\S]*?)<\/div>/i)?.[1] || "Download");
    const quality = stripTags(chunk.match(/<span class="qbadge">([\s\S]*?)<\/span>/i)?.[1] || qualityGuess(name));
    const afterQuality = chunk.split(/<span class="qbadge">[\s\S]*?<\/span>/i)[1] || chunk;
    const size = stripTags(afterQuality.match(/<span class="small">([\s\S]*?)<\/span>/i)?.[1] || "");
    const infoHash = attr(chunk, "info_hash");
    const magnet = attr(chunk, "magnet") || (infoHash ? makeMagnet(infoHash, name) : "");
    const torrentUrl = attr(chunk, "torrent_url");
    const q = attr(chunk, "q");
    const url = torrentUrl || (/^https?:\/\//i.test(q) ? q : "") || magnet;
    const item = toItem(url, "Download", name, quality, size);
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
      signal: AbortSignal.timeout(14000),
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
 * CineSrc embed provider — returns the embed URL as a stream
 * link the user can open directly.  No fragile multi-step
 * extraction; the embed page itself is the playable source.
 * ============================================================ */

async function providerCinesrc(input: Input): Promise<ProviderHit | null> {
  try {
    const isShow = input.type === "show";
    const season = input.season ?? 1;
    const episode = input.episode ?? 1;
    const base = isShow
      ? `https://cinesrc.st/embed/tv/${input.tmdbId}?s=${season}&e=${episode}`
      : `https://cinesrc.st/embed/movie/${input.tmdbId}`;
    const params = new URLSearchParams({
      autoplay: "true",
      controls: "true",
    });
    const sep = base.includes("?") ? "&" : "?";
    const url = `${base}${sep}${params.toString()}`;

    const item: DownloadItem = {
      id: `cinesrc-${url}`,
      url,
      source: "CineSrc",
      quality: "Auto",
      type: "hls",
      fileName: undefined,
    };
    return { downloads: [item], subs: [] };
  } catch {
    return null;
  }
}

/* ============================================================
 * 2Embed provider — queries the 2embed.cc API which returns
 * direct embed/stream URLs for movies and TV shows.
 * ============================================================ */

async function provider2Embed(input: Input): Promise<ProviderHit | null> {
  try {
    const isShow = input.type === "show";
    const season = input.season ?? 1;
    const episode = input.episode ?? 1;

    // 2embed supports TMDB IDs directly via embed URLs
    const embedUrl = isShow
      ? `https://www.2embed.cc/embedtv/${input.tmdbId}?s=${season}&e=${episode}`
      : `https://www.2embed.cc/embed/${input.tmdbId}`;

    const item: DownloadItem = {
      id: `2embed-${embedUrl}`,
      url: embedUrl,
      source: "2Embed",
      quality: "Auto",
      type: "hls",
      fileName: undefined,
    };
    return { downloads: [item], subs: [] };
  } catch {
    return null;
  }
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  try {
    const providers = [providerCinesrc, provider2Embed, providerVyla, providerDlhub];
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