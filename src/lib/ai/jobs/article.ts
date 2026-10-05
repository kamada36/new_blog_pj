import { restoreAffiliateLinks } from "@/lib/ai/affiliate";
import { buildArticlePrompt, buildContinuationPrompt } from "@/lib/ai/articlePrompts";
import {
  getResidentPersona,
  loadArticleForEditor,
  resolveCategoryId,
  upsertArticleDraft,
} from "@/lib/ai/articleStore";
import { generateAndStoreEyecatch, generateEyecatchPrompt } from "@/lib/ai/eyecatch";
import { tryParseOutline } from "@/lib/ai/json";
import { normalizeArticleMarkdown } from "@/lib/ai/markdown";
import { applyArticleSpacing, stripSpacers } from "@/lib/ai/spacing";
import { isVerbosityRiskModel } from "@/lib/ai/models";
import { describeAiError, generateWithContinuation } from "@/lib/ai/provider";
import type { ArticleRequest } from "@/lib/ai/schemas";
import { generateSeoMeta } from "@/lib/ai/seoMeta";
import type { ArticleStreamEvent } from "@/lib/ai/stream";
import type { JobContext } from "./context";

// STEP 2: 本文の生成と保存。
//   本文をストリーミング(上限で切れたら自動継続) → SEOタイトル/メタ/タグとアイキャッチ画像を生成 →
//   Markdownを整えてSupabase(Articleテーブル)へ下書きとして保存(upsert) の順に、1つのジョブで完結させる。
// 元ツールはここでWordPress REST APIへ同期していた。

const MIN_VALID_CONTENT_CHARS = 50;

export async function runArticleJob(body: ArticleRequest, ctx: JobContext<ArticleStreamEvent>): Promise<void> {
  const { send } = ctx;
  const { source, wordCount, modelId, textLinks, bannerLinks } = body;

  const outline = body.outlineJson ? tryParseOutline(body.outlineJson) : null;
  const resident = await getResidentPersona();

  // 新規記事の場合のみ、本文のストリーミングと並行してアイキャッチ画像の生成を始める
  // (追加指示による既存記事の修正では、都度アイキャッチを作り直さない)。
  // 画像側の失敗は本文の生成・保存を止めないよう、このPromiseは決して例外で終わらない。
  const eyecatchPromise =
    !body.articleId && body.generateEyecatch
      ? (async () => {
          const prompt = await generateEyecatchPrompt(source, body.outlineJson, modelId);
          if (!prompt) return null;
          try {
            return { prompt, imageUrl: (await generateAndStoreEyecatch(prompt)) as string | null, error: undefined as string | undefined };
          } catch (error) {
            console.error("[generate] アイキャッチ画像の生成/保存に失敗しました:", error);
            return { prompt, imageUrl: null, error: describeAiError(error) };
          }
        })()
      : Promise.resolve(null);

  const { system, prompt, maxOutputTokens } = buildArticlePrompt({
    source,
    wordCount,
    modelId,
    outlineJson: body.outlineJson,
    additionalInstruction: body.additionalInstruction,
    textLinks,
    bannerLinks,
    // 行間用のスペーサー(&nbsp;)はAIに見せない(保存の直前に付け直す)
    currentArticle: body.currentArticle ? stripSpacers(body.currentArticle) : undefined,
    resident,
  });

  // 出力が膨らみやすいモデル向けの、継続生成を打ち切るための文字数上限
  // (目標文字数±10%に、記法のオーバーヘッドを見込んだ「これ以上は明らかに異常」な値)。
  const hardCharCeiling = isVerbosityRiskModel(modelId) ? Math.round(wordCount * 1.1 * 2.5) : null;

  const generation = await generateWithContinuation({
    modelId,
    system,
    prompt,
    maxOutputTokens,
    buildContinuationPrompt,
    onDelta: (text) => send({ type: "delta", text }),
    signal: ctx.signal,
    hardCharCeiling,
    startedAt: ctx.startedAt,
  });

  if (generation.text.trim().length < MIN_VALID_CONTENT_CHARS) {
    throw new Error("生成された本文が空、または極端に短いため失敗として扱いました。別のモデルで再度お試しください。");
  }
  if (generation.truncated) send({ type: "truncated" });
  send({ type: "phase", phase: "finalizing" });

  // 目印文字列は整形の後でリンクへ戻す(ASPのURLを整形処理に通さないため)
  // 行間(ブロック間の余白)は、AIの出力を整えた後でプログラムが一括して付与する
  const content = restoreAffiliateLinks(
    applyArticleSpacing(normalizeArticleMarkdown(generation.text, { fillMissingIcon: true, normalizeHeadings: true })),
    textLinks,
    bannerLinks
  );

  // SEOメタ・タグは確定した本文から生成し直す。アイキャッチ(並行実行中)もここで待ち合わせる。
  const [seo, eyecatch] = await Promise.all([generateSeoMeta(content, modelId), eyecatchPromise]);
  if (seo) send({ type: "seo", seo });
  if (eyecatch) send({ type: "eyecatch", prompt: eyecatch.prompt, imageUrl: eyecatch.imageUrl, error: eyecatch.error });

  const existing = body.articleId ? await loadArticleForEditor(body.articleId) : null;
  const title = seo?.title || existing?.title || outline?.title?.trim() || source.slice(0, 40).trim();
  const metaDescription = seo?.metaDescription || existing?.metaDescription || outline?.metaDescription?.trim() || "";
  const tagNames = seo?.tags?.length
    ? seo.tags
    : existing
      ? existing.tags.map((t) => t.name)
      : (outline?.targetKeywords ?? []);

  const saved = await upsertArticleDraft(existing?.id, ctx.userId, {
    title,
    slug: outline?.slug,
    excerpt: metaDescription,
    contentMarkdown: content,
    categoryId: existing?.categoryId ?? (await resolveCategoryId(body.categoryId, outline?.categorySlug)),
    tagNames,
    metaTitle: title,
    metaDescription,
    metaKeywords: tagNames.join(", "),
    coverImageUrl: eyecatch?.imageUrl ?? undefined,
  });

  send({ type: "saved", article: saved, content });
  send({ type: "done" });
}
