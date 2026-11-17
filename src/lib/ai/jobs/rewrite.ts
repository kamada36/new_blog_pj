import { prisma } from "@/lib/prisma";
import { contentPath } from "@/lib/slug";
import {
  bannerLinkPlaceholder,
  extractAffiliateCode,
  restoreAffiliateLinks,
  textLinkPlaceholder,
} from "@/lib/ai/affiliate";
import {
  applyRewrite,
  finalizeRewrite,
  getResidentPersona,
  logRewrite,
  saveRewriteBackupIfAbsent,
} from "@/lib/ai/articleStore";
import { collectLinkedSlugs, loadReasons } from "@/lib/ai/linkIndex";
import { normalizeArticleMarkdown } from "@/lib/ai/markdown";
import { applyArticleSpacing, hasSpacers, stripSpacers } from "@/lib/ai/spacing";
import { getMaxOutputTokensForModel, isVerbosityRiskModel } from "@/lib/ai/models";
import { describeAiError, generateWithContinuation } from "@/lib/ai/provider";
import {
  buildRewriteContinuationPrompt,
  buildRewritePrompt,
  splitContentAndSummary,
  type InternalLinkRequest,
} from "@/lib/ai/rewritePrompts";
import type { RewriteRequest } from "@/lib/ai/schemas";
import type { RewriteStreamEvent } from "@/lib/ai/stream";
import type { JobContext } from "./context";

// 既存記事のAIリライト。
//   記事をDBから読む → 初回のみ元の本文をバックアップ → AIでリライト(ストリーミング) →
//   Supabase(Articleテーブル)へ上書き保存 → 履歴を記録 の順に、1つのジョブで完結させる。
// 元ツールはWordPress REST APIから記事を取得・更新していた。「元に戻す」「確定」は server actions 側。

// 元の本文よりこれ以上短くなった場合は、(追加指示が無い限り)出力が崩れたとみなして保存しない
const MIN_LENGTH_RATIO = 0.4;

export async function runRewriteJob(body: RewriteRequest, ctx: JobContext<RewriteStreamEvent>): Promise<void> {
  const { send } = ctx;

  const article = await prisma.article.findUnique({
    where: { id: body.articleId },
    select: { id: true, title: true, slug: true, status: true, publishedAt: true, contentMarkdown: true },
  });
  if (!article) throw new Error("記事が見つかりませんでした。");

  // 内部リンクのURLはクライアントの値を信用せず、IDからDBで引き直す。本文で既にリンク済みの記事は除く。
  const targets = body.internalLinkArticleIds.length
    ? await prisma.article.findMany({
        where: { id: { in: body.internalLinkArticleIds }, status: "published", NOT: { id: article.id } },
        select: { id: true, title: true, slug: true },
      })
    : [];
  // 候補選びのときにAIが書いた「紹介できる文脈」を、挿入位置の手がかりとして渡す
  const reasons = targets.length ? await loadReasons(article.id) : new Map<string, string>();
  const linkedSlugs = collectLinkedSlugs(article.contentMarkdown);
  const internalLinks: InternalLinkRequest[] = targets
    .filter((t) => !linkedSlugs.has(t.slug))
    .map((t) => ({ title: t.title, url: contentPath(t.slug), reason: reasons.get(t.id) }));

  const resident = await getResidentPersona();
  // AI生成記事は行間用のスペーサー(&nbsp;)を含む。AIには見せず、リライト後に付け直す(含まない記事には付けない)。
  const hadSpacers = hasSpacers(article.contentMarkdown);

  // 追加指示にASPのコード(<a href=計測URL>…</a> と計測用の <img>)が貼られていたら、AIに見せる前に目印文字列へ置き換え、
  // リライト後にプログラムが元のまま差し込む。コードをそのまま見せると、AIがURLを書き換えたり、Markdownにできない <img> を
  // 生HTMLのまま本文に残したりする(このブログは生HTMLを描画せず、文字としてそのまま表示される)。
  const affiliate = extractAffiliateCode(body.instruction ?? "");
  const affiliateTokens = [
    ...affiliate.textLinks.map((_, i) => ({ token: textLinkPlaceholder(i), kind: "text" as const })),
    ...affiliate.bannerLinks.map((_, i) => ({ token: bannerLinkPlaceholder(i), kind: "banner" as const })),
  ];

  const { system, prompt } = buildRewritePrompt({
    title: article.title,
    contentMarkdown: hadSpacers ? stripSpacers(article.contentMarkdown) : article.contentMarkdown,
    instruction: body.instruction ? affiliate.text : undefined,
    internalLinks,
    internalLinkFormat: body.internalLinkFormat,
    insertUpdatedNote: body.insertUpdatedNote,
    resident,
    affiliateTokens,
  });

  // 元の本文は、最初のリライト実行時にだけ退避する(連続リライトしても最初の原文を保つ)
  const createdBackup = await saveRewriteBackupIfAbsent(article);
  const logBase = {
    articleId: article.id,
    articleTitle: article.title,
    articleSlug: article.slug,
    model: body.modelId,
    instruction: body.instruction,
  };

  try {
    const originalLength = article.contentMarkdown.length;
    const generation = await generateWithContinuation({
      modelId: body.modelId,
      system,
      prompt,
      // 日本語1文字≒1〜2トークン。出力は元記事とほぼ同じ長さになる前提で、余裕を持たせた上限にする。
      maxOutputTokens: Math.min(getMaxOutputTokensForModel(body.modelId), Math.max(8192, originalLength * 2 + 2048)),
      buildContinuationPrompt: buildRewriteContinuationPrompt,
      onDelta: (text) => send({ type: "delta", text }),
      signal: ctx.signal,
      hardCharCeiling: isVerbosityRiskModel(body.modelId) ? Math.round(originalLength * 2.5) + 2000 : null,
      startedAt: ctx.startedAt,
    });

    const { content, summary } = splitContentAndSummary(generation.text);
    const normalized = normalizeArticleMarkdown(content, { fillMissingIcon: false, normalizeHeadings: false });
    const spaced = hadSpacers ? applyArticleSpacing(normalized) : normalized;

    if (!spaced.trim()) throw new Error("AIの応答が空でした。別のモデルで再度お試しください。");
    // 指示に貼られたアフィリエイトのリンクが、AIの出力から落ちていたら、保存しない(リンクの無いまま公開するのを避ける)
    const missingTokens = affiliateTokens.filter(({ token }) => !spaced.includes(token));
    if (missingTokens.length > 0) {
      throw new Error(
        "追加指示に貼られたアフィリエイトのリンクが、AIの出力に含まれていなかったため、保存しませんでした(元の記事はそのままです)。もう一度お試しいただくか、別のモデルをお試しください。"
      );
    }
    // 目印文字列は、整形・行間の付与の後で、ASPから提供された元のリンクへ戻す(ASPのURLを整形処理に通さない)。
    // リライトでは、セットは組まない(バナーは既に本文にあり、指示の目印は個別に置かれる)。
    const rewritten = restoreAffiliateLinks(spaced, affiliate.textLinks, affiliate.bannerLinks, 0);
    // 公開中の記事を壊さないための安全弁。出力が上限で途切れた/大幅に短くなった結果は保存しない。
    if (generation.truncated) {
      throw new Error("出力が上限に達して途中で終了したため、保存しませんでした(元の記事はそのままです)。別のモデルをお試しください。");
    }
    if (!body.instruction && originalLength > 0 && rewritten.length < originalLength * MIN_LENGTH_RATIO) {
      throw new Error("リライト結果が元の記事より極端に短かったため、保存しませんでした(元の記事はそのままです)。");
    }

    const { status } = await applyRewrite(article, rewritten, body.publishStatus);
    await logRewrite({ ...logBase, status: "success", summary });

    const missingLinkUrls = internalLinks.filter((link) => !rewritten.includes(link.url)).map((link) => link.url);
    send({ type: "result", result: { summary, missingLinkUrls, status } });
    send({ type: "done" });
  } catch (error) {
    // 何も書き換えていないのに「未確定のリライトあり」状態だけが残らないよう、今回作ったバックアップは消す
    if (createdBackup) await finalizeRewrite(article.id);
    await logRewrite({ ...logBase, status: "failed", errorMessage: describeAiError(error, body.modelId) });
    throw error;
  }
}
