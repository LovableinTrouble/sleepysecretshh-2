/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { z } from "zod";

const RecommendInput = z.object({
  query: z.string().min(1).max(500),
  context: z.string().max(2000).optional(),
});

export const recommendMedia = createServerFn({ method: "POST" })
  .inputValidator((input: any) => RecommendInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { text: "AI is not configured. Add LOVABLE_API_KEY." };

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": key },
    });

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system:
          "You are Luna, a warm, concise movie & TV recommender on Sleepy. Always respond in 2-4 sentences. Suggest 3-5 titles by name when relevant.",
        prompt: data.context ? `${data.context}\n\nUser: ${data.query}` : data.query,
      });
      return { text };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      if (status === 429)
        return { text: "I'm getting too many requests right now — try again in a moment." };
      if (status === 402)
        return {
          text: "AI credits are exhausted on this workspace. Please add credits to keep chatting.",
        };
      return { text: "Hmm, I couldn't reach the AI right now. Try again shortly." };
    }
  });

const AiTitlesInput = z.object({
  query: z.string().min(1).max(500),
});

/**
 * AI Search: turn a natural-language query into a list of movie/TV titles.
 * Uses the Lovable AI Gateway (no external backend).
 */
export const aiSearchTitles = createServerFn({ method: "POST" })
  .inputValidator((input: any) => AiTitlesInput.parse(input))
  .handler(async ({ data }): Promise<{ titles: string[]; error: string | null }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { titles: [], error: "LOVABLE_API_KEY not configured" };

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system:
          "You are a movie/TV search assistant. Given a user's query, identify the SINGLE most likely specific movie or TV show they are referring to. Respond with ONLY a JSON array of 1-3 exact title strings (no year, no extra info), most likely first. If the query is vague or describes a mood/genre, return up to 5 specific titles. No prose, no keys, no markdown — just the raw JSON array.",
        prompt: data.query,
      });
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return { titles: [], error: "AI returned no JSON" };
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return { titles: [], error: "AI response not array" };
      const titles = parsed
        .filter((t: any): t is string => typeof t === "string" && t.trim().length > 0)
        .slice(0, 12);
      return { titles, error: null };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      if (status === 429) return { titles: [], error: "Rate limited — try again shortly." };
      if (status === 402)
        return { titles: [], error: "AI credits exhausted on this workspace." };
      return { titles: [], error: e?.message || "AI request failed" };
    }
  });
