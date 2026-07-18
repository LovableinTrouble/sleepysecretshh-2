/* eslint-disable @typescript-eslint/no-explicit-any */
// Vyla scraper client — collects verified HLS/MP4 stream sources via the
// Vyla SSE API. Uses the standard-tier session token issued by the
// player.vyla.cc embed backend (which has an embedded standard key), so
// streaming endpoints work without a partner API key.

export interface VylaSource {
  source: string;
  label: string;
  url: string;
  type: "hls" | "mp4";
  qualities?: string[];
  subtitles?: { url: string; language: string; label: string }[];
}

export interface VylaScrapeResult {
  sources: VylaSource[];
  subtitles: { url: string; language: string; label: string }[];
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

let cachedToken: { token: string; expires: number } | null = null;

export async function getStandardToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;
  try {
    const res = await fetch("https://player.vyla.cc/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    if (!data.token) return null;
    cachedToken = { token: data.token, expires: Date.now() + 50 * 60 * 1000 };
    return data.token;
  } catch {
    return null;
  }
}

function inferType(url: string): "hls" | "mp4" {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mkv")) return "mp4";
  return "hls";
}

export async function scrapeVyla(
  tmdbId: number | string,
  kind: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<VylaScrapeResult> {
  const token = await getStandardToken();
  if (!token) return { sources: [], subtitles: [] };

  const isTv = kind === "tv";
  const endpoint = isTv ? "tv" : "movie";
  const params = new URLSearchParams({ id: String(tmdbId) });
  if (isTv && season != null && episode != null) {
    params.set("season", String(season));
    params.set("episode", String(episode));
  }
  const sseUrl = `https://api.vyla.cc/${endpoint}?${params.toString()}`;

  const res = await fetch(sseUrl, {
    headers: { "X-Session-Token": token, accept: "text/event-stream", "user-agent": UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok || !res.body) return { sources: [], subtitles: [] };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const sources: VylaSource[] = [];
  const subtitles: { url: string; language: string; label: string }[] = [];
  const seen = new Set<string>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6)) as any;
        if (evt.type === "source" && evt.source?.url) {
          const url = String(evt.source.url);
          if (seen.has(url)) continue;
          seen.add(url);
          sources.push({
            source: String(evt.source.source || evt.source.provider || "vyla"),
            label: String(evt.source.label || evt.source.quality || "Stream"),
            url,
            type: inferType(url),
            qualities: Array.isArray(evt.source.qualities)
              ? evt.source.qualities.map(String)
              : undefined,
            subtitles: Array.isArray(evt.source.subtitles)
              ? evt.source.subtitles.map((s: any) => ({
                  url: String(s.url),
                  language: String(s.language || s.lang || "en"),
                  label: String(s.label || s.language || s.lang || "Subtitles"),
                }))
              : undefined,
          });
        }
        if (evt.type === "subtitle" && evt.subtitle?.url) {
          subtitles.push({
            url: String(evt.subtitle.url),
            language: String(evt.subtitle.language || evt.subtitle.lang || "en"),
            label: String(evt.subtitle.label || evt.subtitle.language || "Subtitles"),
          });
        }
      } catch {}
    }
  }
  return { sources, subtitles };
}
