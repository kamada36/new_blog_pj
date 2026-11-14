import "server-only";
import { prisma } from "@/lib/prisma";
import { jstDateKey } from "@/lib/viewAnalytics";
import { contentPath } from "@/lib/slug";
import { mapWithConcurrency } from "@/lib/ai/linkIndex";
import { describeAiError } from "@/lib/ai/provider";
import { generateSnsPosts, type SnsArticleSource } from "./generate";
import { SNS_VARIANT_NUMBERS } from "./format";
import { addDaysToDateKey, assignSlots } from "./schedule";

/** 1回の呼び出し(Server Action)で文面を作る記事数。Netlifyの関数は60秒で打ち切られるため、画面側で繰り返し呼ぶ。 */
export const SNS_BATCH_SIZE = 6;
const AI_CONCURRENCY = 3;
/** 公開からこの日数以内の記事は「新記事」として、投稿の割り当てで優先する */
const NEW_ARTICLE_DAYS = 14;
/** 同じ記事の投稿どうしを空ける日数 */
const MIN_GAP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const SOURCE_SELECT = {
  title: true,
  metaDescription: true,
  excerpt: true,
  contentMarkdown: true,
  linkIndex: { select: { summary: true, keywords: true } },
} as const;

type SourceRow = {
  title: string;
  metaDescription: string;
  excerpt: string;
  contentMarkdown: string;
  linkIndex: { summary: string; keywords: string[] } | null;
};

function toSource(article: SourceRow): SnsArticleSource {
  return {
    title: article.title,
    metaDescription: article.metaDescription,
    excerpt: article.excerpt,
    contentMarkdown: article.contentMarkdown,
    summary: article.linkIndex?.summary,
    keywords: article.linkIndex?.keywords,
  };
}

export interface SnsStats {
  publishedArticles: number;
  articlesWithPosts: number;
  draft: number;
  approvedUnscheduled: number;
  scheduledUpcoming: number;
  skipped: number;
}

export async function getSnsStats(): Promise<SnsStats> {
  const today = jstDateKey(new Date());
  const [publishedArticles, articlesWithPosts, draft, approvedUnscheduled, scheduledUpcoming, skipped] = await Promise.all([
    prisma.article.count({ where: { status: "published" } }),
    prisma.article.count({ where: { status: "published", snsPosts: { some: {} } } }),
    prisma.snsPost.count({ where: { status: "draft" } }),
    prisma.snsPost.count({ where: { status: "approved", scheduledDate: null } }),
    prisma.snsPost.count({ where: { status: "approved", scheduledDate: { gte: today } } }),
    prisma.snsPost.count({ where: { status: "skipped" } }),
  ]);
  return { publishedArticles, articlesWithPosts, draft, approvedUnscheduled, scheduledUpcoming, skipped };
}

export interface SnsBatchResult {
  /** 今回、文面を作れた記事の数 */
  generated: number;
  failed: { articleId: string; title: string; error: string }[];
  /** 文面がまだ無い公開記事の数(今回失敗した記事を除く) */
  remaining: number;
}

/** 文面のまだ無い公開記事を、新しい順に SNS_BATCH_SIZE 件ぶん処理する。 */
export async function generateNextBatch(excludeIds: string[]): Promise<SnsBatchResult> {
  const where = { status: "published", snsPosts: { none: {} }, id: { notIn: excludeIds } };
  const articles = await prisma.article.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take: SNS_BATCH_SIZE,
    select: { id: true, ...SOURCE_SELECT },
  });

  const failed: SnsBatchResult["failed"] = [];
  let generated = 0;
  await mapWithConcurrency(articles, AI_CONCURRENCY, async (article) => {
    try {
      const posts = await generateSnsPosts(toSource(article), SNS_VARIANT_NUMBERS);
      await prisma.snsPost.createMany({
        data: posts.map((p) => ({ articleId: article.id, variant: p.variant, mainText: p.mainText, replyBody: p.replyBody })),
        skipDuplicates: true,
      });
      generated++;
    } catch (error) {
      console.error(`[sns] 「${article.title}」の投稿文の生成に失敗しました:`, error);
      failed.push({ articleId: article.id, title: article.title, error: describeAiError(error) });
    }
  });

  const skipIds = [...excludeIds, ...failed.map((f) => f.articleId)];
  const remaining = await prisma.article.count({ where: { ...where, id: { notIn: skipIds } } });
  return { generated, failed, remaining };
}

/** 1件の文面を、同じ切り口で作り直す。 */
export async function regeneratePost(postId: string): Promise<void> {
  const post = await prisma.snsPost.findUnique({
    where: { id: postId },
    select: { id: true, variant: true, article: { select: SOURCE_SELECT } },
  });
  if (!post) throw new Error("投稿が見つかりませんでした。");

  const [generated] = await generateSnsPosts(toSource(post.article), [post.variant]);
  if (!generated) throw new Error("AIが投稿文を返しませんでした。");
  // 文面が変わるので、承認は取り消して確認し直してもらう(日付・枠はそのまま残す)
  await prisma.snsPost.update({
    where: { id: postId },
    data: { mainText: generated.mainText, replyBody: generated.replyBody, status: "draft" },
  });
}

/**
 * 承認済みで日付の未定の投稿に、明日以降の日付と時間枠を割り当てる。
 * 優先度: 新記事(公開から14日以内) → 切り口の番号が小さい順(全記事に1巡してから2巡目) → 閲覧数の多い順。
 */
export async function scheduleApprovedPosts(options: {
  postsPerDay: number;
  slotCount: number;
  days: number;
}): Promise<{ scheduled: number; unscheduled: number }> {
  const now = new Date();
  const startDate = addDaysToDateKey(jstDateKey(now), 1);

  const [pending, occupied] = await Promise.all([
    prisma.snsPost.findMany({
      where: { status: "approved", scheduledDate: null, article: { status: "published" } },
      select: { id: true, articleId: true, variant: true, article: { select: { publishedAt: true, viewCount: true } } },
    }),
    prisma.snsPost.findMany({
      where: { status: "approved", scheduledDate: { gte: startDate } },
      select: { articleId: true, scheduledDate: true, slot: true },
    }),
  ]);

  const isNew = (publishedAt: Date | null) =>
    publishedAt !== null && now.getTime() - publishedAt.getTime() <= NEW_ARTICLE_DAYS * DAY_MS;
  const candidates = pending
    .map((p) => ({ ...p, group: isNew(p.article.publishedAt) ? 0 : 1 }))
    .sort((a, b) => a.group - b.group || a.variant - b.variant || b.article.viewCount - a.article.viewCount);

  const assignments = assignSlots({
    candidates,
    occupied: occupied.flatMap((o) =>
      o.scheduledDate && o.slot ? [{ date: o.scheduledDate, slot: o.slot, articleId: o.articleId }] : []
    ),
    startDate,
    days: options.days,
    postsPerDay: options.postsPerDay,
    slotCount: options.slotCount,
    minGapDays: MIN_GAP_DAYS,
  });

  await prisma.$transaction(
    assignments.map((a) => prisma.snsPost.update({ where: { id: a.id }, data: { scheduledDate: a.date, slot: a.slot } }))
  );
  return { scheduled: assignments.length, unscheduled: pending.length - assignments.length };
}

/** 明日以降に割り当てた日付・枠を解除する(今日以前の分は、すでにツールへ渡した可能性があるため残す)。 */
export async function clearUpcomingSchedule(): Promise<number> {
  const tomorrow = addDaysToDateKey(jstDateKey(new Date()), 1);
  const result = await prisma.snsPost.updateMany({
    where: { scheduledDate: { gte: tomorrow } },
    data: { scheduledDate: null, slot: null },
  });
  return result.count;
}

export interface QueueRow {
  id: string;
  articleId: string;
  title: string;
  url: string;
  date: string;
  slot: number;
  mainText: string;
  replyText: string;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** 承認済みで、期間内に日付・枠が割り当てられている投稿(公開中の記事のものだけ)。日付・枠の順。 */
export async function loadQueueRows(range: { from: string; to: string }): Promise<QueueRow[]> {
  const posts = await prisma.snsPost.findMany({
    where: {
      status: "approved",
      scheduledDate: { gte: range.from, lte: range.to },
      slot: { not: null },
      article: { status: "published" },
    },
    orderBy: [{ scheduledDate: "asc" }, { slot: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      articleId: true,
      mainText: true,
      replyBody: true,
      scheduledDate: true,
      slot: true,
      article: { select: { title: true, slug: true } },
    },
  });

  const base = siteUrl();
  return posts.flatMap((p) => {
    if (!p.scheduledDate || !p.slot) return [];
    const url = `${base}${contentPath(p.article.slug)}`;
    return [
      {
        id: p.id,
        articleId: p.articleId,
        title: p.article.title,
        url,
        date: p.scheduledDate,
        slot: p.slot,
        mainText: p.mainText,
        // 返信の本文の後に、空行を1つ空けてURLを置く
        replyText: `${p.replyBody}\n\n${url}`,
      },
    ];
  });
}
