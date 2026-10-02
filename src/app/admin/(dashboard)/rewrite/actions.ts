"use server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeRewrite, logRewrite, revertRewrite } from "@/lib/ai/articleStore";
import {
  getLinkIndexStatus,
  indexNextBatch,
  matchArticles,
  resetLinkIndex,
  type IndexBatchResult,
} from "@/lib/ai/linkIndex";
import type { LinkIndexStatus, LinkSuggestionView } from "@/lib/ai/linkTypes";
import { describeAiError } from "@/lib/ai/provider";

type ActionResult = { ok: true } | { ok: false; error: string };

const SESSION_EXPIRED = "セッションが切れました。ログインし直してください。";

/** 未確定のリライトを取り消し、リライト前の本文・公開状態に戻す。 */
export async function revertRewriteAction(articleId: string): Promise<ActionResult> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  try {
    const article = await revertRewrite(articleId);
    if (!article) return { ok: false, error: "元に戻せるリライト内容が見つかりませんでした。" };
    await logRewrite({ articleId, articleTitle: article.title, articleSlug: article.slug, status: "reverted" });
    return { ok: true };
  } catch (error) {
    console.error("[rewrite] 元に戻す処理に失敗しました:", error);
    return { ok: false, error: error instanceof Error ? error.message : "元に戻すのに失敗しました。" };
  }
}

/** リライト内容を確定する(退避していた元の本文を破棄する。以後は元に戻せない)。 */
export async function finalizeRewriteAction(articleId: string): Promise<ActionResult> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  try {
    await finalizeRewrite(articleId);
    return { ok: true };
  } catch (error) {
    console.error("[rewrite] 確定処理に失敗しました:", error);
    return { ok: false, error: error instanceof Error ? error.message : "確定に失敗しました。" };
  }
}

export interface LinkCandidate {
  id: string;
  title: string;
  slug: string;
}

/** 内部リンクの候補(公開済みの自サイト記事)をタイトルで検索する。 */
export async function searchLinkCandidatesAction(
  query: string,
  excludeArticleId: string
): Promise<{ ok: true; items: LinkCandidate[] } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  const q = query.trim().slice(0, 100);
  if (!q) return { ok: true, items: [] };

  const items = await prisma.article.findMany({
    where: { status: "published", title: { contains: q, mode: "insensitive" }, NOT: { id: excludeArticleId } },
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: { id: true, title: true, slug: true },
  });
  return { ok: true, items };
}

/** 指定した記事ぶんの内部リンク候補を、AIが選別して保存する(最大10件)。force=trueで既存の結果も探し直す。 */
export async function findLinkSuggestionsAction(
  articleIds: string[],
  force: boolean
): Promise<
  | { ok: true; results: Record<string, LinkSuggestionView[]>; failed: { articleId: string; error: string }[] }
  | { ok: false; error: string }
> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  if (articleIds.length === 0) return { ok: true, results: {}, failed: [] };
  try {
    const { results, failed } = await matchArticles(articleIds, force);
    return { ok: true, results, failed };
  } catch (error) {
    console.error("[rewrite] 内部リンク候補の選別に失敗しました:", error);
    return { ok: false, error: describeAiError(error) };
  }
}

/**
 * 記事の要約索引を作る。索引の無い公開記事を15件ずつ要約するので、画面から remaining が 0 になるまで繰り返し呼ぶ。
 * reset=true のときは、先に索引と候補をすべて消して作り直す。
 */
export async function indexLinksAction(input: {
  excludeIds: string[];
  reset: boolean;
}): Promise<({ ok: true; status: LinkIndexStatus } & IndexBatchResult) | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  try {
    if (input.reset) await resetLinkIndex();
    const batch = await indexNextBatch(input.excludeIds.slice(0, 500));
    return { ok: true, ...batch, status: await getLinkIndexStatus() };
  } catch (error) {
    console.error("[rewrite] 記事索引の作成に失敗しました:", error);
    return { ok: false, error: describeAiError(error) };
  }
}
