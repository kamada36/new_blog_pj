"use server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeRewrite, logRewrite, revertRewrite } from "@/lib/ai/articleStore";

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
