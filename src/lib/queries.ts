import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 12;

// 関数化せずモジュール定数のままだと new Date() がサーバー起動時に1回だけ
// 評価され固定されてしまい、以後公開した記事が一覧に出てこなくなるため関数にする。
function publishedWhere() {
  return {
    status: "published",
    publishedAt: { lte: new Date() },
  } as const;
}

const cardSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImageUrl: true,
  publishedAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
} as const;

// Header/Footer/Sidebar(デスクトップ)/Sidebar(モバイルドロワー)など、
// 同一リクエスト内で複数箇所から呼ばれるため、リクエスト単位でメモ化する。
export const getSiteSetting = cache(async function getSiteSetting() {
  const setting = await prisma.siteSetting.findFirst();
  return (
    setting ?? {
      id: "singleton",
      siteName: "レジリエンサーCafe",
      tagline: "YOUR RESILIENCE MATTERS!",
      footerCopyright: "Resilient-cer Cafe",
      sponsorSidebarEmbed: "",
      sponsorSidebarCompactEmbed: "",
      sponsorFooterEmbed: "",
      heroBackgroundUrl: null,
      heroCharacterResilientUrl: null,
      heroCharacterAikoUrl: null,
      residentName: "アイコ",
      residentBio:
        "プログラミングを勉強中でエンジニアへの転職に憧れている。日々このサイト内でレジサンからITに関する様々な事を学んでいる。",
      residentAvatarUrl: null,
    }
  );
});

export const getPrimaryAuthor = cache(async function getPrimaryAuthor() {
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
});

export const getCategories = cache(async function getCategories() {
  return prisma.category.findMany({ orderBy: { order: "asc" } });
});

// 記事本文中の [sc name="xxx"] ショートコード展開に使う、キャラクター吹き出しプリセット一覧。
export const getShortcodes = cache(async function getShortcodes() {
  return prisma.shortcode.findMany({ orderBy: { createdAt: "asc" } });
});

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export async function getTagBySlug(slug: string) {
  return prisma.tag.findUnique({ where: { slug } });
}

export async function getRecentArticles(limit = 4) {
  return prisma.article.findMany({
    where: publishedWhere(),
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: cardSelect,
  });
}

export async function getArticlesByCategory(categoryId: string, limit = 4) {
  return prisma.article.findMany({
    where: { ...publishedWhere(), categoryId },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: cardSelect,
  });
}

export const getPopularArticles = cache(async function getPopularArticles(limit = 5) {
  return prisma.article.findMany({
    where: publishedWhere(),
    orderBy: { viewCount: "desc" },
    take: limit,
    select: cardSelect,
  });
});

export const getArchiveMonths = cache(async function getArchiveMonths() {
  const articles = await prisma.article.findMany({
    where: publishedWhere(),
    select: { publishedAt: true },
  });
  const counts = new Map<string, { year: number; month: number; count: number }>();
  for (const article of articles) {
    if (!article.publishedAt) continue;
    const year = article.publishedAt.getFullYear();
    const month = article.publishedAt.getMonth() + 1;
    const key = `${year}-${month}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { year, month, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
});

export async function getArticlesPage(params: {
  where?: Record<string, unknown>;
  page: number;
}) {
  const page = Math.max(1, params.page);
  const where = { ...publishedWhere(), ...params.where };

  const [items, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: cardSelect,
    }),
    prisma.article.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getArticleBySlug(slug: string) {
  return prisma.article.findUnique({
    where: { slug },
    include: {
      category: true,
      tags: true,
      author: true,
    },
  });
}

// 同一訪問者(IP+UAのハッシュ)による短時間の再読み込み・再訪問は
// カウントしない。WordPressの主要な閲覧数計測プラグインも同様に
// 「一定期間内は1visitorにつき1カウント」という重複排除を行っている。
const VIEW_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24時間

export async function recordArticleView(id: string, visitorHash: string) {
  const since = new Date(Date.now() - VIEW_DEDUP_WINDOW_MS);
  const recentDuplicate = await prisma.articleView.findFirst({
    where: { articleId: id, visitorHash, createdAt: { gte: since } },
    select: { id: true },
  });
  if (recentDuplicate) return;

  await prisma.$transaction([
    prisma.article.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    }),
    prisma.articleView.create({ data: { articleId: id, visitorHash } }),
  ]);
}

export type ArticleViewStats = {
  today: number;
  week: number;
  month: number;
  total: number;
};

export async function getArticleViewStatsMap(
  articleIds: string[]
): Promise<Map<string, ArticleViewStats>> {
  const map = new Map<string, ArticleViewStats>();
  if (articleIds.length === 0) return map;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (startOfToday.getDay() + 6) % 7;
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - daysSinceMonday);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthViews, articles] = await Promise.all([
    prisma.articleView.findMany({
      where: { articleId: { in: articleIds }, createdAt: { gte: startOfMonth } },
      select: { articleId: true, createdAt: true },
    }),
    prisma.article.findMany({
      where: { id: { in: articleIds } },
      select: { id: true, viewCount: true },
    }),
  ]);

  for (const id of articleIds) {
    map.set(id, { today: 0, week: 0, month: 0, total: 0 });
  }
  for (const view of monthViews) {
    const stats = map.get(view.articleId);
    if (!stats) continue;
    stats.month += 1;
    if (view.createdAt >= startOfWeek) stats.week += 1;
    if (view.createdAt >= startOfToday) stats.today += 1;
  }
  for (const article of articles) {
    const stats = map.get(article.id);
    if (stats) stats.total = article.viewCount;
  }

  return map;
}

export async function getRelatedArticles(article: { id: string; categoryId: string }, limit = 4) {
  return prisma.article.findMany({
    where: {
      ...publishedWhere(),
      categoryId: article.categoryId,
      id: { not: article.id },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: cardSelect,
  });
}

export async function getAdjacentArticles(article: { id: string; publishedAt: Date | null }) {
  if (!article.publishedAt) return { prev: null, next: null };

  const [prev, next] = await Promise.all([
    prisma.article.findFirst({
      where: {
        status: "published",
        publishedAt: { lt: article.publishedAt },
      },
      orderBy: { publishedAt: "desc" },
      select: cardSelect,
    }),
    prisma.article.findFirst({
      where: {
        status: "published",
        publishedAt: { gt: article.publishedAt, lte: new Date() },
      },
      orderBy: { publishedAt: "asc" },
      select: cardSelect,
    }),
  ]);

  return { prev, next };
}

export async function getPageBySlug(slug: string) {
  return prisma.page.findUnique({ where: { slug } });
}

export { PAGE_SIZE };
