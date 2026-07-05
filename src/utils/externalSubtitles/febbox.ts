/* ============================================
   External subtitle fetcher (sub.1x2.space)
   Replaces the old dead fed-subs.pstream.mov scraper — that upstream no
   longer returns usable results, so no subtitles were ever loading.

   API:
     movie: GET https://sub.1x2.space/api/movie/{tmdbId}
     tv:    GET https://sub.1x2.space/api/tv/{tmdbId}/{season}/{episode}

   Response shape:
     [
       { "label": "English", "language": "english", "status": "cached",
         "size": 91872, "url": "/subtitle/movie/123/English.vtt" },
       ...
     ]

   `url` is host-relative — it's served from the same sub.1x2.space origin
   and must be resolved against it before being handed to the player.
   ============================================ */

export interface ExternalSubtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}

const SUB_API_BASE = "https://sub.1x2.space";

// Minimal label/language-name → ISO 639-1 mapping.
const LABEL_TO_CODE: Record<string, string> = {
  arabic: "ar",
  bengali: "bn",
  chinese: "zh",
  english: "en",
  filipino: "tl",
  french: "fr",
  hausa: "ha",
  indonesian: "id",
  panjabi: "pa",
  punjabi: "pa",
  portuguese: "pt",
  russian: "ru",
  swahili: "sw",
  urdu: "ur",
  spanish: "es",
  german: "de",
  italian: "it",
  japanese: "ja",
  korean: "ko",
  turkish: "tr",
  polish: "pl",
  dutch: "nl",
  swedish: "sv",
  danish: "da",
  norwegian: "no",
  finnish: "fi",
  greek: "el",
  hebrew: "he",
  hungarian: "hu",
  romanian: "ro",
  czech: "cs",
  slovak: "sk",
  ukrainian: "uk",
  vietnamese: "vi",
  thai: "th",
  hindi: "hi",
  malay: "ms",
  tagalog: "tl",
};

function languageCode(label: string): string {
  const k = label.trim().toLowerCase();
  return LABEL_TO_CODE[k] ?? k.slice(0, 2);
}

function resolveSubUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  return `${SUB_API_BASE}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
}

interface RawSubEntry {
  label?: string;
  language?: string;
  status?: string;
  size?: number;
  url?: string;
}

/**
 * Fetch subtitles from sub.1x2.space for a movie or TV episode.
 * Returns an empty array (never throws) if the upstream is unavailable or
 * returns nothing usable — callers should treat this as "no external subs".
 */
export async function scrapeExternalCaptions(
  tmdbId: string,
  season?: number,
  episode?: number,
): Promise<ExternalSubtitle[]> {
  try {
    const url =
      season && episode
        ? `${SUB_API_BASE}/api/tv/${encodeURIComponent(tmdbId)}/${season}/${episode}`
        : `${SUB_API_BASE}/api/movie/${encodeURIComponent(tmdbId)}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as RawSubEntry[] | { subtitles?: RawSubEntry[] };
    const list: RawSubEntry[] = Array.isArray(data) ? data : Array.isArray(data?.subtitles) ? data.subtitles : [];
    if (!list.length) return [];

    const out: ExternalSubtitle[] = [];
    for (const item of list) {
      if (!item?.url) continue;
      const resolved = resolveSubUrl(item.url);
      const ext = resolved.split(".").pop()?.toLowerCase();
      const type: "srt" | "vtt" = ext === "srt" ? "srt" : "vtt";
      const langSource = item.language || item.label || "";
      out.push({
        url: resolved,
        language: languageCode(langSource),
        label: item.label || langSource || "Unknown",
        type,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// Backwards-compatible alias for existing imports.
export const scrapeFebboxCaptions = scrapeExternalCaptions;
