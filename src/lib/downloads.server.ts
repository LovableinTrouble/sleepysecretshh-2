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

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

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

function toItem(
  url: string,
  source: string,
  label: string,
  quality?: string,
  size?: string,
): DownloadItem | null {
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

async function providerVyla(input: Input): Promise<{ downloads: DownloadItem[]; subs: DownloadsResult["subtitles"] } | null> {
  // Public key gives access to /api/downloads/* (non-streaming endpoints only).
  // Standard/partner keys are configured via VYLA_API_KEY when available.
  const key = process.env.VYLA_API_KEY?.trim() || "public_api_key";

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

// The Vyla /api/downloads/tv endpoint has no TV providers on the public tier.
// As a fallback, we obtain a standard-tier session token from the
// player.vyla.cc embed backend (which has its own embedded standard key),
// then hit the /tv SSE streaming endpoint to collect verified source URLs.
// HLS sources are offered as stream downloads; MP4 sources as direct downloads.
async function providerVylaTvStream(input: Input): Promise<{ downloads: DownloadItem[]; subs: DownloadsResult["subtitles"] } | null> {
  if (input.type !== "show") return null;
  const season = input.season ?? 1;
  const episode = input.episode ?? 1;
  try {
    // 1. Get a standard-tier token from the player's own auth endpoint.
    const authRes = await fetch("https://player.vyla.cc/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!authRes.ok) return null;
    const { token } = (await authRes.json()) as { token: string };
    if (!token) return null;

    // 2. Stream the /tv SSE endpoint and collect source events.
    const sseUrl = `https://api.vyla.cc/tv?id=${input.tmdbId}&season=${season}&episode=${episode}`;
    const sseRes = await fetch(sseUrl, {
      headers: { "X-Session-Token": token, accept: "text/event-stream", "user-agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!sseRes.ok || !sseRes.body) return null;

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const sources: { source: string; label: string; url: string }[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "source" && evt.source?.url) {
            sources.push({
              source: String(evt.source.source || "vyla"),
              label: String(evt.source.label || "Stream"),
              url: String(evt.source.url),
            });
          }
        } catch {}
      }
    }
    if (!sources.length) return null;

    // 3. Convert each source to a download item.
    const downloads = sources
      .map((s) =>
        toItem(
          s.url,
          `Vyla · ${s.label}`,
          `${input.title} S${season}E${episode}`,
          "Auto",
          undefined,
        ),
      )
      .filter(Boolean) as DownloadItem[];
    return downloads.length ? { downloads, subs: [] } : null;
  } catch {
    return null;
  }
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  const hit = await providerVyla(input).catch(() => null);
  let downloads = hit?.downloads ?? [];

  // TV downloads fallback: the Vyla /api/downloads/tv endpoint returns empty
  // on the public tier, so fall back to collecting stream sources from /tv SSE.
  if (!downloads.length && input.type === "show") {
    const tvHit = await providerVylaTvStream(input).catch(() => null);
    downloads = tvHit?.downloads ?? [];
  }

  return {
    ok: downloads.length > 0,
    downloads,
    subtitles: [],
    error: downloads.length ? undefined : "No downloads found for this title.",
  };
}
