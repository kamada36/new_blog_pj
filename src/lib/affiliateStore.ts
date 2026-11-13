// 本文から抽出したアフィリエイトリンク(src/lib/affiliateLinks.ts)を、DBの
// ArticleAffiliateLink / AffiliateProgram / Article.affiliateStatus へ反映する。
// 管理画面(Server Action)と scripts/ の両方から使うため、PrismaClient は引数で受け取る。
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { extractAffiliateLinks, suggestProgramName, type ExtractedAffiliateLink } from "./affiliateLinks";

type Db = Pick<PrismaClient, "$transaction" | "$executeRaw" | "affiliateProgram" | "articleAffiliateLink">;

/** 抽出したリンクが属するサービスを引き、無いものは仮の名前で新しく作る。識別子 → サービスIDの対応を返す。 */
async function resolveProgramIds(db: Db, links: ExtractedAffiliateLink[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const keys = [...new Set(links.map((link) => link.programKey))];
  if (keys.length === 0) return ids;

  // サービスは keys に識別子を配列で持つ(今は1サービス1識別子。複数の識別子を1サービスにまとめる拡張に備えている)
  const known = await db.affiliateProgram.findMany({
    where: { keys: { hasSome: keys } },
    select: { id: true, keys: true },
  });
  for (const program of known) {
    for (const key of program.keys) ids.set(key, program.id);
  }

  for (const key of keys) {
    if (ids.has(key)) continue;
    const own = links.filter((link) => link.programKey === key);
    const created = await db.affiliateProgram.create({
      data: {
        name:
          own.find((link) => link.suggestedName)?.suggestedName ??
          suggestProgramName(
            own.map((link) => link.anchorText),
            own[0].asp,
            key
          ),
        asp: own[0].asp,
        keys: [key],
      },
      select: { id: true },
    });
    ids.set(key, created.id);
  }
  return ids;
}

/**
 * 記事1件分のリンクを作り直す。Article.affiliateStatus は生SQLで更新する:
 * prisma.article.update だと @updatedAt が現在時刻になり、記事の「更新日」(一覧の並び順)が変わってしまうため。
 */
async function replaceArticleLinks(
  db: Db,
  articleId: string,
  links: ExtractedAffiliateLink[],
  programIds: Map<string, string>
): Promise<void> {
  const operations: Prisma.PrismaPromise<unknown>[] = [
    db.articleAffiliateLink.deleteMany({ where: { articleId } }),
  ];
  if (links.length > 0) {
    operations.push(
      db.articleAffiliateLink.createMany({
        data: links.map((link) => ({
          articleId,
          programId: programIds.get(link.programKey)!,
          url: link.url,
          kind: link.kind,
          anchorText: link.anchorText,
          imageUrl: link.imageUrl,
          occurrences: link.occurrences,
        })),
      })
    );
  }
  operations.push(
    db.$executeRaw`UPDATE "Article" SET "affiliateStatus" = ${links.length > 0 ? "has" : "none"} WHERE "id" = ${articleId}`
  );
  await db.$transaction(operations);
}

/** 記事1件の本文からリンクを抽出して反映する。 */
export async function syncArticleAffiliateLinks(db: Db, articleId: string, contentMarkdown: string): Promise<void> {
  const links = extractAffiliateLinks(contentMarkdown);
  const programIds = await resolveProgramIds(db, links);
  await replaceArticleLinks(db, articleId, links, programIds);
}

/**
 * 記事の保存に付随して呼ぶ版。リンク管理の更新に失敗しても、記事の保存そのものは失敗させない
 * (テーブル未作成のまま先にデプロイされた場合などに、記事が編集できなくなるのを避ける)。
 * 取りこぼした分は、管理画面の「再スキャン」で追いつく。
 */
export async function syncArticleAffiliateLinksSafely(db: Db, articleId: string, contentMarkdown: string): Promise<void> {
  try {
    await syncArticleAffiliateLinks(db, articleId, contentMarkdown);
  } catch (error) {
    console.error("[affiliate] リンクの抽出結果を保存できませんでした:", error);
  }
}

export interface AffiliateScanSummary {
  articles: number;
  articlesWithLinks: number;
  links: number;
  programsCreated: number;
}

/** 全記事の本文を読み直して、リンク情報を作り直す(初回の取り込みと、管理画面の「再スキャン」)。 */
export async function syncAllArticleAffiliateLinks(
  db: Db & Pick<PrismaClient, "article">
): Promise<AffiliateScanSummary> {
  const articles = await db.article.findMany({ select: { id: true, contentMarkdown: true } });
  const extracted = articles.map((article) => ({ id: article.id, links: extractAffiliateLinks(article.contentMarkdown) }));

  const programsBefore = await db.affiliateProgram.count();
  const programIds = await resolveProgramIds(
    db,
    extracted.flatMap((entry) => entry.links)
  );
  const programsAfter = await db.affiliateProgram.count();

  for (const entry of extracted) {
    await replaceArticleLinks(db, entry.id, entry.links, programIds);
  }

  return {
    articles: articles.length,
    articlesWithLinks: extracted.filter((entry) => entry.links.length > 0).length,
    links: extracted.reduce((sum, entry) => sum + entry.links.length, 0),
    programsCreated: programsAfter - programsBefore,
  };
}
