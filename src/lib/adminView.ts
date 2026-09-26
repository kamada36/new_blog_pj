import "server-only";
import { getSessionUser } from "@/lib/auth";
import { getArticleViewStatsMap, type ArticleViewStats } from "@/lib/queries";

// 管理者ログイン時のみ、記事カードに閲覧数統計を表示するためのヘルパー。
export async function getAdminViewStatsForArticles(
  articles: { id: string }[]
): Promise<Map<string, ArticleViewStats> | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (articles.length === 0) return new Map();
  return getArticleViewStatsMap(articles.map((article) => article.id));
}
