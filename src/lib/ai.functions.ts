import { createServerFn } from "@tanstack/react-start";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { z } from "zod";

const RecommendInput = z.object({
  query: z.string().min(1).max(500),
  context: z.string().max(2000).optional(),
});

export const recommendMedia = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecommendInput.parse(input))
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
      if (status === 429) return { text: "I'm getting too many requests right now — try again in a moment." };
      if (status === 402) return { text: "AI credits are exhausted on this workspace. Please add credits to keep chatting." };
      return { text: "Hmm, I couldn't reach the AI right now. Try again shortly." };
    }
  });
