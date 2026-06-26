/* ============================================
   p-stream febbox subtitle scraper
   Source: github p-stream/p-stream (utils/externalSubtitles/febbox.ts)
   Uses the public fed-subs.pstream.mov API.
   Safe to call from the server (showbox.server.ts merges these in).
   ============================================ */

export interface PstreamFebboxSubtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}

// Minimal label → ISO 639-1 mapping. Covers the languages fed-subs returns.
const LABEL_TO_CODE: Record<string, string> = {
  english: "en", "english (us)": "en", "english (uk)": "en",
  spanish: "es", "spanish (latin america)": "es",
  french: "fr", german: "de", italian: "it", portuguese: "pt",
  "portuguese (brazil)": "pt-BR", russian: "ru", japanese: "ja",
  korean: "ko", chinese: "zh", "chinese (simplified)": "zh",
  "chinese (traditional)": "zh-TW", arabic: "ar", turkish: "tr",
  polish: "pl", dutch: "nl", swedish: "sv", danish: "da",
  norwegian: "no", finnish: "fi", greek: "el", hebrew: "he",
  hungarian: "hu", romanian: "ro", czech: "cs", slovak: "sk",
  ukrainian: "uk", vietnamese: "vi", thai: "th", indonesian: "id",
  hindi: "hi", malay: "ms", tagalog: "tl", filipino: "tl",
};

function languageCode(label: string): string {
  const k = label.trim().toLowerCase();
  return LABEL_TO_CODE[k] ?? k.slice(0, 2);
}

/**
 * Fetch febbox subtitles from p-stream's public API.
 * `tmdbOrImdbId` accepts either — the upstream resolver handles both.
 */
export async function scrapeFebboxCaptions(
  tmdbOrImdbId: string,
  season?: number,
  episode?: number,
): Promise<PstreamFebboxSubtitle[]> {
  try {
    const url =
      season && episode
        ? `https://fed-subs.pstream.mov/tv/${tmdbOrImdbId}/${season}/${episode}`
        : `https://fed-subs.pstream.mov/movie/${tmdbOrImdbId}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      error?: string;
      subtitles?: Record<string, { subtitle_link?: string; subtitle_name?: string }>;
    };
    if (data?.error || !data?.subtitles) return [];

    const out: PstreamFebboxSubtitle[] = [];
    for (const [languageName, sub] of Object.entries(data.subtitles)) {
      if (!sub || typeof sub !== "object" || !sub.subtitle_link) continue;
      const ext = sub.subtitle_link.split(".").pop()?.toLowerCase();
      const type: "srt" | "vtt" = ext === "vtt" ? "vtt" : "srt";
      const language = languageCode(languageName);
      out.push({
        url: sub.subtitle_link,
        language,
        label: sub.subtitle_name || languageName,
        type,
      });
    }
    return out;
  } catch {
    return [];
  }
}
