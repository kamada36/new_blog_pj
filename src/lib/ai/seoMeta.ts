import "server-only";
import { buildSeoMetaPrompt } from "./articlePrompts";
import { extractJsonFromText } from "./json";
import { generateShortText } from "./provider";
import type { SeoMeta } from "./stream";

// 構成案のtitle/metaDescriptionは「ソース」から見積もった案でしかなく、追加指示や自動継続を経た最終本文と
// ズレることがある。そのため本文が確定するたびに、その最終テキストからSEOタイトル・メタディスクリプション・
// タグを生成し直す。失敗しても本文の生成・保存は成功させたいので、例外は投げずnullを返す。
export async function generateSeoMeta(articleMarkdown: string, modelId: string): Promise<SeoMeta | null> {
  if (!articleMarkdown.trim()) return null;
  const { system, prompt } = buildSeoMetaPrompt(articleMarkdown);

  try {
    const text = await generateShortText(modelId, system, prompt);
    const parsed = JSON.parse(extractJsonFromText(text));
    if (parsed && typeof parsed.title === "string" && typeof parsed.metaDescription === "string") {
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags
            .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
            .map((t: string) => t.trim())
        : [];
      return { title: parsed.title.trim(), metaDescription: parsed.metaDescription.trim(), tags };
    }
    console.warn("[seo] SEOメタ情報のJSON形式が不正だったため無視します:", text.slice(0, 200));
    return null;
  } catch (error) {
    console.error("[seo] SEOタイトル・メタディスクリプションの生成に失敗しました:", error);
    return null;
  }
}
