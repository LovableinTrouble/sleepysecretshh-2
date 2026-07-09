import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { searchMulti } from "../../lib/tmdb";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

/**
 * Server-side lookup of the Groq API key.
 *
 * TanStack Start ships an SSR runtime (Nitro, default cloudflare target on
 * Lovable) that exposes server secrets via `process.env.<NAME>`. Prefer the
 * unprefixed `GROQ_API_KEY`; the `VITE_GROQ_API_KEY` fallback is a
 * transitional safety net for setups that already wired a key under that
 * name. (VITE_ prefixed vars are only injected on the client side, so they
 * are not appropriate for server secrets going forward.)
 */
function getApiKey(): string | undefined {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
}

/**
 * Robust title parser. LLMs almost never stick to "comma-separated list only",
 * so we accept:
 *   - JSON arrays:             ["A","B"]
 *   - numbered lists:          1. A / 2) B
 *   - bullets:                 - A / * A / • A
 *   - plain newlines:          A\nB
 *   - quoted titles:           "A","B" or 'A','B'
 */
function parseTitles(raw: string): string[] {
  if (!raw) return [];
  const cleaned = raw.replace(/```[\w-]*\n?/g, "").replace(/```/g, "").trim();

  // Try JSON array first (some models wrap the list in []).
  const jsonMatch = cleaned.match(/\[[^\]]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        return arr.map((t) => String(t).trim()).filter(Boolean);
      }
    } catch {
      /* fall through to text parsing */
    }
  }

  const tokens = cleaned
    .split(/[,\n]/)
    .map((t) =>
      t
        .replace(/^[\s\-•*\d.)]+/, "") // strip leading bullets / numbering / dots
        .replace(/^["']|["']$/g, "") // strip surrounding quotes
        .trim(),
    )
    .filter((t) => t.length > 1 && t.length < 200);

  // Dedupe case-insensitively while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

export const Route = createFileRoute("/api/ai-search")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        // ---- Parse body ----
        let body: { q?: string } = {};
        try {
          body = (await request.json()) ?? {};
        } catch {
          return Response.json(
            { results: [], source: "fallback-error", aiError: "Invalid JSON body" },
            { status: 400, headers: CORS },
          );
        }
        const query = (body.q ?? "").trim();
        if (!query) {
          return Response.json(
            { results: [], source: "fallback-error", aiError: "Missing query" },
            { status: 400, headers: CORS },
          );
        }

        // ---- 1. Ask Groq for recommendations (lazy; fail soft) ----
        const apiKey = getApiKey();
        let aiTitles: string[] = [];
        let aiError: string | null = null;

        if (apiKey) {
          try {
            const groq = createOpenAICompatible({
              name: "groq",
              baseURL: "https://api.groq.com/openai/v1",
              apiKey,
            });
            const { text } = await generateText({
              model: groq("openai/gpt-oss-120b"),
              system:
                "You are a movie and TV show recommendation AI. The user query may be a genre, mood, era, theme, actor, director, or a partial title. Reply with 6 to 10 relevant movie or TV show titles, ONE PER LINE. Output ONLY the titles — no numbering, no bullets, no quotes, no commentary, no markdown, no preamble.",
              prompt: query,
              temperature: 0.4,
            });
            console.log("[ai-search] Groq raw response:", text);
            aiTitles = parseTitles(text);
          } catch (e: any) {
            aiError = e?.message ?? "Groq request failed";
            console.error("[ai-search] Groq error:", e);
          }
        } else {
          aiError = "GROQ_API_KEY not set on the server";
          console.warn(
            "[ai-search] GROQ_API_KEY missing — falling back to direct TMDB search.",
          );
        }

        // ---- 2. Resolve titles → TMDB media in parallel ----
        let titlesToLookup: string[];
        let source: "ai" | "fallback-no-ai" | "fallback-error";
        if (aiTitles.length > 0) {
          titlesToLookup = aiTitles;
          source = "ai";
        } else {
          // AI failed or returned something unparseable — search directly
          // with the raw user query so the page is never empty.
          titlesToLookup = [query];
          source = "fallback-no-ai";
        }

        const perTitle = await Promise.all(
          titlesToLookup.map((t) =>
            searchMulti(t).catch((e) => {
              console.error("[ai-search] searchMulti failed for", t, e);
              return [];
            }),
          ),
        );
        let results = perTitle.flat();

        // If AI gave titles but TMDB returned nothing (hallucinated), retry
        // with the raw user query so the page is never empty when AI messes up.
        if (source === "ai" && results.length === 0) {
          const direct = await searchMulti(query).catch(() => []);
          if (direct.length > 0) {
            results = direct;
            source = "fallback-no-ai";
          }
        }
        if (results.length === 0) source = "fallback-error";

        return Response.json({ results, source, aiError }, { headers: CORS });
      },
    },
  },
});
