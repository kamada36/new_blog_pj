import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { buildOutlinePrompt } from "@/lib/ai/articlePrompts";
import { getCategoryOptions, getResidentPersona } from "@/lib/ai/articleStore";
import { getProviderForModel } from "@/lib/ai/models";
import { requireGeminiKey, startTextStream } from "@/lib/ai/provider";
import type { OutlineRequest } from "@/lib/ai/schemas";
import type { OutlineStreamEvent } from "@/lib/ai/stream";
import type { JobContext } from "./context";

// STEP 1: リサーチ & 構成案の生成。Google Search Grounding(Gemini専用)で最新情報を調べさせるため、
// 数十秒〜数分かかることがある。構成案JSONを少しずつ(イベントとして)返し、パースはクライアント側で行う。
export async function runOutlineJob(input: OutlineRequest, ctx: JobContext<OutlineStreamEvent>): Promise<void> {
  const { source, modelId, wordCount, textLinks, bannerLinks } = input;

  if (getProviderForModel(modelId) !== "gemini") {
    throw new Error("構成案の生成(リサーチ)は、Google検索が使えるGeminiモデルのみ対応しています。");
  }

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
        abortSignal: ctx.signal,
        onError: ({ error }) => onError(error),
      }),
    ctx.signal
  );

  for await (const delta of textStream) {
    ctx.send({ type: "delta", text: delta });
  }
  ctx.send({ type: "done" });
}
