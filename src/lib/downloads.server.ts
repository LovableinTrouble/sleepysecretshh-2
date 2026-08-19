// Keep BASE pointed to your worker so it handles the initial bypass
const BASE = "https://round-bread-8638.slinkingalt.workers.dev/";

async function resolveDownloadProviders(input) {
  try {
    const path =
      input.type === "show"
        ? `/tv/${input.tmdbId}?season=${input.season ?? 1}&episode=${input.episode ?? 1}`
        : `/movie/${input.tmdbId}`;

    // 1. Fetch metadata through the worker proxy to bypass streamrip's HTML/Cloudflare block
    const res = await fetch(BASE + path, {
      method: "GET",
    });

    if (!res.ok) throw new Error("Worker metadata failure status: " + res.status);

    const json = await res.json();
    const links = Array.isArray(json?.downloads) ? json.downloads : [];

    const downloads = links
      .filter((l) => l?.url)
      .map((l, i) => {
        const originalUrl = String(l.url);

        // Unify checking both target JSON property variations
        const providerName = String(l.source || l.server || "").toLowerCase();

        // 2. TARGETED PROXY ROUTING: Intercept Bollyflix, let UHD/Google remain native
        let finalUrl = originalUrl;
        if (providerName.includes("bolly")) {
          finalUrl = BASE + "?proxy=" + encodeURIComponent(originalUrl);
        }

        // Clean quality mapping logic
        let q = "HD";
        const n = Number(l.quality);
        if (Number.isFinite(n) && n > 0) {
          q = n >= 2160 ? "4K" : n + "p";
        } else if (l.quality) {
          q = String(l.quality);
        }

        // URL extension extractor
        const u = originalUrl.toLowerCase();
        const ext = u.includes(".mkv") ? "mkv" : u.includes(".mp4") ? "mp4" : "file";

        // Clean filename string sanitization
        const safeTitle = input.title
          .replace(/[^a-zA-Z0-9]+/g, " ")
          .trim()
          .replace(/\s+/g, "_");
        const fileName = safeTitle + "_" + q + "." + (ext === "file" ? "mp4" : ext);

        return {
          id: "streamrip-" + i + "-" + originalUrl.slice(0, 40),
          url: finalUrl, // Routed through worker if Bollyflix, left raw if UHD
          source: l.source || l.server || "Direct",
          quality: q,
          type: ext,
          size: l.size ? String(l.size) : undefined,
          fileName: fileName,
        };
      });

    return { ok: true, downloads: downloads, subtitles: [] };
  } catch (e) {
    return {
      ok: true,
      downloads: [],
      subtitles: [],
      error: e?.message || "Failed to process downloads",
    };
  }
}
