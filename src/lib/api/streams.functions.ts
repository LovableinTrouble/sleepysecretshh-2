import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ENABLE_HLS_PROBE = false;
const streamCache = new Map<string, { result: ResolvedStreamResult; ts: number }>();
const streamInflight = new Map<string, Promise<ResolvedStreamResult>>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const NEGATIVE_CACHE_TTL = 60 * 1000;
const CINEPRO_TIMEOUT_MS = 6500;
const XPASS_BASE = "https://play.xpass.top";
const XPASS_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  accept: "application/json, */*",
  referer: `${XPASS_BASE}/`,
  "accept-language": "en-US,en;q=0.9",
};

export interface ResolvedQuality {
  url: string;
  quality: string;
  label: string;
  size: string;
  isHls: boolean;
}

export interface ResolvedStreamResult {
  ok: boolean;
  qualities: ResolvedQuality[];
  subtitles: { url: string; language: string; label: string; type: "srt" | "vtt" }[];
  fileName?: string;
  logs: { step: string; status: "ok" | "fail"; detail?: string }[];
  error?: string;
}

/* ===========================================================
 * FebBox — direct HLS resolver (up to 4K via showbox.server)
 * =========================================================== */

const FebboxRequestSchema = z.object({
  title: z.string().min(1),
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
  uiCookie: z.string().optional(),
  releaseYear: z.number().optional(),
});

export const resolveFebboxStream = createServerFn({ method: "POST" })
  .inputValidator((d) => FebboxRequestSchema.parse(d))
  .handler(async ({ data }): Promise<ResolvedStreamResult> => {
    try {
      const { resolveStream } = await import("@/lib/showbox.server");
      const { stream, logs } = await resolveStream({
        title: data.title,
        tmdbId: data.tmdbId,
        type: data.type,
        season: data.season,
        episode: data.episode,
        uiCookie: data.uiCookie,
        releaseYear: data.releaseYear,
      });
      if (!stream) {
        return {
          ok: false,
          qualities: [],
          subtitles: [],
          logs,
          error: logs[logs.length - 1]?.detail || "No stream",
        };
      }
      return {
        ok: stream.qualities.length > 0,
        qualities: stream.qualities.map((q) => ({
          url: q.url,
          quality: q.quality,
          label: q.label,
          size: q.size,
          isHls: Boolean(q.isHls),
        })),
        subtitles: stream.subtitles,
        fileName: stream.fileName,
        logs,
      };
    } catch (err: any) {
      return {
        ok: false,
        qualities: [],
        subtitles: [],
        logs: [{ step: "febbox", status: "fail", detail: err?.message }],
        error: err?.message || "FebBox request failed",
      };
    }
  });

/* ===========================================================
 * CinePro — OMSS direct HLS resolver (no auth)
 * =========================================================== */

const CineproRequestSchema = z.object({
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
  cineproUrl: z.string().min(1).refine(
    (v) => v.startsWith("http://") || v.startsWith("https://"),
    { message: "cineproUrl must start with http:// or https://" },
  ),
});

export const resolveCineproStream = createServerFn({ method: "POST" })
  .inputValidator((d) => CineproRequestSchema.parse(d))
  .handler(async ({ data }): Promise<ResolvedStreamResult> => {
    const logs: { step: string; status: "ok" | "fail"; detail?: string }[] = [];
    try {
      const parsedBase = new URL(data.cineproUrl.trim());
      if (parsedBase.protocol === "http:" && !["localhost", "127.0.0.1", "0.0.0.0"].includes(parsedBase.hostname)) {
        parsedBase.protocol = "https:";
      }
      parsedBase.pathname = parsedBase.pathname.replace(/\/v1\/?$/i, "");
      const base = parsedBase.toString().replace(/\/$/, "");
      const cacheKey = `${base}-${data.tmdbId}-${data.type}-${data.season ?? 0}-${data.episode ?? 0}`;
      const cached = streamCache.get(cacheKey);
      const ttl = cached?.result.ok ? CACHE_TTL : NEGATIVE_CACHE_TTL;
      if (cached && Date.now() - cached.ts < ttl) return cached.result;
      const pending = streamInflight.get(cacheKey);
      if (pending) return pending;

      const work = (async (): Promise<ResolvedStreamResult> => {
      const endpoint =
        data.type === "movie"
          ? `${base}/v1/movies/${data.tmdbId}`
          : `${base}/v1/tv/${data.tmdbId}/seasons/${data.season ?? 1}/episodes/${data.episode ?? 1}`;
      const res = await fetch(endpoint, {
        redirect: "follow",
        signal: AbortSignal.timeout(CINEPRO_TIMEOUT_MS),
        headers: {
          Accept: "application/json",
        },
      });
      if (res.status === 404) {
        logs.push({ step: "cinepro", status: "fail", detail: "No sources found" });
        return { ok: false, qualities: [], subtitles: [], logs };
      }
      if (!res.ok) {
        logs.push({ step: "cinepro", status: "fail", detail: `HTTP ${res.status}` });
        return { ok: false, qualities: [], subtitles: [], logs };
      }
      const body = await res.text();
      const json: any = JSON.parse(body);
      const sourceList = json.sources ?? json.data?.sources ?? json.stream?.sources ?? json.result?.sources ?? [];
      const subtitleList = json.subtitles ?? json.data?.subtitles ?? json.stream?.subtitles ?? json.result?.subtitles ?? [];
      logs.push({
        step: "cinepro",
        status: "ok",
        detail: `${sourceList.length ?? 0} sources, ${subtitleList.length ?? 0} subtitles`,
      });
      if (!sourceList?.length) {
        logs.push({ step: "cinepro", status: "fail", detail: "Empty sources array" });
        return { ok: false, qualities: [], subtitles: [], logs };
      }
      // CinePro returns proxy URLs anchored to its OWN internal host
      // (e.g. http://localhost:10000/v1/proxy?...). Rewrite any /v1/proxy URL
      // so its origin matches the public instance base.
      const rewrite = (raw: string): string => {
        const s = String(raw || "");
        if (!s) return s;
        if (!s.startsWith("http")) return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
        const proxyIdx = s.indexOf("/v1/proxy");
        if (proxyIdx > 0) return `${base}${s.slice(proxyIdx)}`;
        return s;
      };

      const prettyQuality = (q: string): string => {
        const s = String(q || "").toLowerCase();
        if (s.includes("2160") || s.includes("4k")) return "4K";
        if (s.includes("1440")) return "1440p";
        if (s.includes("1080")) return "1080p";
        if (s.includes("720")) return "720p";
        if (s.includes("480")) return "480p";
        if (s.includes("360")) return "360p";
        return q || "Auto";
      };
      // Nickname each CinePro quality tier with a clean, branded name.
      // Delta = top tier · Gamma = mid · Toro = low.
      const nickFor = (q: string): string => {
        const r = rankDirectQuality(q);
        if (r >= 90) return "Delta";   // 4K / 1440p
        if (r >= 60) return "Gamma";   // 1080p / 720p
        return "Toro";                 // 480p and below
      };
      const sourceCounts = new Map<string, number>();
      const qualitiesRaw: ResolvedQuality[] = (sourceList || []).map((s: any) => {
        const url = rewrite(s.url || s.file || s.link);
        const pretty = prettyQuality(s.quality || s.label || s.name || s.resolution);
        const count = (sourceCounts.get(pretty) ?? 0) + 1;
        sourceCounts.set(pretty, count);
        return {
          url,
          quality: pretty,
          label: `${nickFor(pretty)} · ${pretty}${count > 1 ? ` · Source ${count}` : ""}`,
          size: "",
          isHls: s.type === "hls" || s.format === "hls" || url.includes(".m3u8"),
        };
      }).filter((q: ResolvedQuality) => q.url && q.url.startsWith("http"))
        .sort((a: ResolvedQuality, b: ResolvedQuality) => rankDirectQuality(b.quality) - rankDirectQuality(a.quality));
      const seen = new Set<string>();
      const qualities = qualitiesRaw.filter((q) => {
        if (seen.has(q.url)) return false;
        seen.add(q.url);
        return true;
      });
      const playableQualities = ENABLE_HLS_PROBE
        ? await Promise.all(
            qualities.map(async (q) => ({ q, playable: q.isHls ? await isPlayableHls(q.url) : true })),
          ).then((checked) => checked.filter((item) => item.playable).map((item) => item.q))
        : qualities;
      if (playableQualities.length !== qualities.length) {
        logs.push({
          step: "cinepro",
          status: playableQualities.length ? "ok" : "fail",
          detail: `Filtered ${qualities.length - playableQualities.length} broken stream URL${qualities.length - playableQualities.length === 1 ? "" : "s"}`,
        });
      }
      if (!playableQualities.length) {
        logs.push({ step: "cinepro", status: "fail", detail: "No playable URLs returned" });
        return { ok: false, qualities: [], subtitles: [], logs };
      }

      const subtitles = (subtitleList || []).map((s: any) => {
        const url = rewrite(s.url || s.file || s.link);
        return {
          url,
          language: s.label?.toLowerCase().slice(0, 2) || "en",
          label: s.label || "English",
          type: (s.format === "vtt" ? "vtt" : "srt") as "vtt" | "srt",
        };
      });
      const successResult: ResolvedStreamResult = { ok: true, qualities: playableQualities, subtitles, logs };
      streamCache.set(cacheKey, { result: successResult, ts: Date.now() });
      return successResult;
      })().then((result) => {
        if (!result.ok) streamCache.set(cacheKey, { result, ts: Date.now() });
        return result;
      }).finally(() => {
        streamInflight.delete(cacheKey);
      });

      streamInflight.set(cacheKey, work);
      return work;
    } catch (err: any) {
      logs.push({ step: "cinepro", status: "fail", detail: err?.name === "TimeoutError" ? "Timed out" : err?.message });
      return { ok: false, qualities: [], subtitles: [], logs };
    }
  });

/* ===========================================================
 * Best download URL — FebBox only.
 * =========================================================== */

const DownloadSchema = z.object({
  title: z.string().min(1),
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
  uiCookie: z.string().optional(),
});

function rank(q: string) {
  const s = String(q || "").toLowerCase();
  if (s.includes("2160") || s.includes("4k")) return 100;
  if (s.includes("1440")) return 90;
  if (s.includes("1080")) return 80;
  if (s.includes("720")) return 60;
  if (s.includes("480")) return 40;
  if (s.includes("360")) return 20;
  return 10;
}

function rankDirectQuality(q: string) {
  return rank(q);
}

function firstPlayableLine(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
}

async function isPlayableHls(url: string): Promise<boolean> {
  try {
    const fetchText = async (u: string) => {
      const res = await fetch(u, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    };
    const master = await fetchText(url);
    const variant = firstPlayableLine(master);
    const playlistUrl = variant ? new URL(variant, url).toString() : url;
    const media = variant ? await fetchText(playlistUrl) : master;
    const segment = firstPlayableLine(media);
    if (!segment) return false;
    const decodedSegment = decodeURIComponent(segment);
    if (/\.html?(\?|$)/i.test(decodedSegment)) return false;
    const segmentUrl = new URL(segment, playlistUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let bytes = new Uint8Array();
    try {
      const res = await fetch(segmentUrl, {
        signal: controller.signal,
        redirect: "follow",
        cache: "no-store",
        headers: { Range: "bytes=0-63" },
      });
      if (!res.ok && res.status !== 206) return false;
      const type = res.headers.get("content-type") || "";
      if (/image|html/i.test(type)) return false;
      const reader = res.body?.getReader();
      const first = reader ? await reader.read() : { value: new Uint8Array(await res.arrayBuffer()) };
      await reader?.cancel().catch(() => {});
      bytes = first.value ?? new Uint8Array();
    } finally {
      clearTimeout(timeout);
    }
    if (bytes.length < 8) return false;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const mpegTs = bytes[0] === 0x47;
    const mp4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    return !png && (mpegTs || mp4 || id3);
  } catch {
    return false;
  }
}

export const resolveDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => DownloadSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; url?: string; fileName?: string; quality?: string; error?: string }> => {
    try {
      const { resolveStream } = await import("@/lib/showbox.server");
      const { stream } = await resolveStream({
        title: data.title,
        tmdbId: data.tmdbId,
        type: data.type,
        season: data.season,
        episode: data.episode,
        uiCookie: data.uiCookie,
      });
      if (stream?.qualities?.length) {
        const progressive = stream.qualities.filter((q) => !q.isHls);
        const pool = progressive.length ? progressive : stream.qualities;
        const best = [...pool].sort((a, b) => rank(b.quality) - rank(a.quality))[0];
        return { ok: true, url: best.url, quality: best.quality, fileName: stream.fileName };
      }
    } catch (err: any) {
      return { ok: false, error: err?.message || "Download lookup failed" };
    }
    return { ok: false, error: "No download available" };
  });

/* ===========================================================
 * Xpass — Pobreflix/XPASS direct HLS resolver (no auth needed)
 * =========================================================== */

const XpassSchema = z.object({
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
});

function buildXpassUrls(tmdbId: string, type: "movie" | "show", s?: number, e?: number): string[] {
  if (type === "movie") {
    return [
      `${XPASS_BASE}/mov/${tmdbId}/0/0/0/playlist.json`,
      `${XPASS_BASE}/vrk/movie/${tmdbId}/playlist.json`,
      `${XPASS_BASE}/vsr/movie/${tmdbId}/playlist.json`,
      `${XPASS_BASE}/meg/movie/${tmdbId}/0/0/playlist.json`,
      `${XPASS_BASE}/vxr/movie/${tmdbId}/playlist.json`,
    ];
  }
  const se = s ?? 1;
  const ep = e ?? 1;
  return [
    `${XPASS_BASE}/mov/${tmdbId}/${se}/${ep}/0/playlist.json`,
    `${XPASS_BASE}/vrk/tv/${tmdbId}/${se}/${ep}/playlist.json`,
    `${XPASS_BASE}/vsr/tv/${tmdbId}/${se}/${ep}/playlist.json`,
    `${XPASS_BASE}/meg/tv/${tmdbId}/${se}/${ep}/playlist.json`,
    `${XPASS_BASE}/vxr/tv/${tmdbId}/${se}/${ep}/playlist.json`,
  ];
}

export const resolveXpassStream = createServerFn({ method: "POST" })
  .inputValidator((d) => XpassSchema.parse(d))
  .handler(async ({ data }): Promise<ResolvedStreamResult> => {
    const logs: { step: string; status: "ok" | "fail"; detail?: string }[] = [];
    const urls = buildXpassUrls(data.tmdbId, data.type, data.season, data.episode);
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: XPASS_HEADERS, signal: AbortSignal.timeout(9000) });
        if (!res.ok) {
          logs.push({ step: `xpass ${url}`, status: "fail", detail: `HTTP ${res.status}` });
          continue;
        }
        const json: any = await res.json().catch(() => null);
        const file: string | undefined = json?.playlist?.[0]?.sources?.[0]?.file;
        if (!file || !/^https?:\/\//i.test(file)) continue;
        const { registerFebboxProxyTarget } = await import("@/lib/showbox.server");
        const proxied = registerFebboxProxyTarget(file, { referer: `${XPASS_BASE}/` });
        logs.push({ step: "xpass", status: "ok", detail: url });
        return {
          ok: true,
          qualities: [
            { url: proxied, quality: "Auto", label: "Xpass · Auto", size: "", isHls: true },
          ],
          subtitles: [],
          logs,
        };
      } catch (err: any) {
        logs.push({ step: `xpass ${url}`, status: "fail", detail: err?.message });
      }
    }
    return { ok: false, qualities: [], subtitles: [], logs, error: "No Xpass playlist available" };
  });
