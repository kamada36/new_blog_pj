import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { getSessionUser } from "@/lib/auth";
import { buildOutlinePrompt } from "@/lib/ai/articlePrompts";
import { getCategoryOptions, getResidentPersona } from "@/lib/ai/articleStore";
import { badRequestResponse, ndjsonResponse, unauthorizedResponse } from "@/lib/ai/ndjsonResponse";
import { getProviderForModel } from "@/lib/ai/models";
import { requireGeminiKey, startTextStream } from "@/lib/ai/provider";
import { outlineRequestSchema } from "@/lib/ai/schemas";
import type { OutlineStreamEvent } from "@/lib/ai/stream";

// STEP 1: リサーチ & 構成案の生成。Google Search Grounding(Gemini専用)で最新情報を調べさせるため、
// 数十秒かかることがある。ストリーミングで構成案JSONを少しずつ返し、パースはクライアント側で行う。
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const parsed = outlineRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequestResponse(parsed.error.issues[0]?.message ?? "入力内容が正しくありません。");
  const { source, modelId, wordCount, textLinks, bannerLinks } = parsed.data;

  if (getProviderForModel(modelId) !== "gemini") {
    return badRequestResponse("構成案の生成(リサーチ)は、Google検索が使えるGeminiモデルのみ対応しています。");
  }

  return ndjsonResponse<OutlineStreamEvent>(async (send) => {
    const google = createGoogleGenerativeAI({ apiKey: requireGeminiKey() });
    const [categories, resident] = await Promise.all([getCategoryOptions(), getResidentPersona()]);
    const { system, prompt } = buildOutlinePrompt({ source, wordCount, textLinks, bannerLinks, categories, resident });

    const { textStream } = await startTextStream(
      (onError) =>
        streamText({
          model: google(modelId),
          system,
          prompt,
          // モデル自身が必要に応じてGoogle検索を実行し、学習データより新しい事実を反映する
          tools: { google_search: google.tools.googleSearch({}) },
          maxOutputTokens: 8192,
          abortSignal: req.signal,
          onError: ({ error }) => onError(error),
        }),
      req.signal
    );

    for await (const delta of textStream) {
      send({ type: "delta", text: delta });
    }
    send({ type: "done" });
  }, modelId);
}
