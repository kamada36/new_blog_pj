import "server-only";
import { prisma } from "@/lib/prisma";
import { jstParts, startOfJstDay } from "@/lib/jst";

// 管理画面の「閲覧数分析」の集計。閲覧の記録(ArticleView)を、日本時間の日付ごとに数える。
//   - 1件の記録 = 「同じ訪問者が、同じ記事を、24時間に1回」(recordArticleView の重複排除)。
//   - 記録は、新サイトの公開(2026-10-14)以降のもの。それ以前の閲覧数は、記事の累計(viewCount)にだけ含まれる
//     (旧サイトからの引き継ぎ分を含む)ため、日別・期間別の数字には出ない。
//   - 公開中の記事の閲覧だけを集計する。

const DAY_MS = 24 * 60 * 60 * 1000;
/** 集計に使う日数の上限(これより古い記録は読み込まない) */
export const MAX_ANALYTICS_DAYS = 90;

export type ViewRow = { articleId: string; visitorHash: string; createdAt: Date };

/** 日本時間の日付キー(YYYY-MM-DD)。 */
export function jstDateKey(date: Date): string {
  const { year, month, day } = jstParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 今日(日本時間)を含む直近 days 日分の日付キー(古い順)と、その最初の日の 0:00。 */
export function recentDays(days: number, now: Date = new Date()): { keys: string[]; start: Date } {
  const count = Math.min(Math.max(1, Math.floor(days)), MAX_ANALYTICS_DAYS);
  const start = new Date(startOfJstDay(now).getTime() - (count - 1) * DAY_MS);
  const keys = Array.from({ length: count }, (_, i) => jstDateKey(new Date(start.getTime() + i * DAY_MS)));
  return { keys, start };
}

/** 直近 days 日分の閲覧の記録を読み込む(公開中の記事のみ)。 */
export async function loadViewRows(days: number): Promise<ViewRow[]> {
  const { start } = recentDays(days);
  return prisma.articleView.findMany({
    where: { createdAt: { gte: start }, article: { status: "published" } },
    select: { articleId: true, visitorHash: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export type PeriodSummary = { views: number; visitors: number };
export type Summary = { today: PeriodSummary; yesterday: PeriodSummary; week: PeriodSummary; month: PeriodSummary };

/** 今日・昨日・直近7日・直近30日の、閲覧数と訪問者数(重複なし)。rows には、直近30日以上を含めること。 */
export function summarize(rows: ViewRow[], now: Date = new Date()): Summary {
  const todayStart = startOfJstDay(now).getTime();
  // 昨日は、昨日の 0:00 から今日の 0:00 の前まで(今日の分は含めない)
  const windows = {
    today: { from: todayStart, to: Infinity },
    yesterday: { from: todayStart - DAY_MS, to: todayStart },
    week: { from: todayStart - 6 * DAY_MS, to: Infinity },
    month: { from: todayStart - 29 * DAY_MS, to: Infinity },
  } as const;
  const keys = ["today", "yesterday", "week", "month"] as const;
  const views = { today: 0, yesterday: 0, week: 0, month: 0 };
  const visitors = { today: new Set<string>(), yesterday: new Set<string>(), week: new Set<string>(), month: new Set<string>() };
  for (const row of rows) {
    const t = row.createdAt.getTime();
    for (const key of keys) {
      if (t >= windows[key].from && t < windows[key].to) {
        views[key] += 1;
        visitors[key].add(row.visitorHash);
      }
    }
  }
  return {
    today: { views: views.today, visitors: visitors.today.size },
    yesterday: { views: views.yesterday, visitors: visitors.yesterday.size },
    week: { views: views.week, visitors: visitors.week.size },
    month: { views: views.month, visitors: visitors.month.size },
  };
}

/** 日別の閲覧数(全記事の合計、または1記事)。days 日分を、閲覧のない日も 0 で埋めて返す。 */
export function dailySeries(rows: ViewRow[], days: number, articleId?: string): { key: string; value: number }[] {
  const { keys } = recentDays(days);
  const counts = new Map(keys.map((key) => [key, 0]));
  for (const row of rows) {
    if (articleId && row.articleId !== articleId) continue;
    const key = jstDateKey(row.createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({ key, value: counts.get(key) ?? 0 }));
}

export type RankingRow = {
  id: string;
  title: string;
  slug: string;
  categoryName: string;
  publishedAt: Date | null;
  today: number;
  yesterday: number;
  week: number;
  month: number;
  /** 累計(旧サイトからの引き継ぎ分を含む。記事の viewCount) */
  total: number;
};

export type RankingArticle = {
  id: string;
  title: string;
  slug: string;
  viewCount: number;
  publishedAt: Date | null;
  category: { name: string };
};

/** 記事ごとの、今日・昨日・直近7日・直近30日・累計の閲覧数。閲覧のない記事も 0 で含める。 */
export function buildRanking(articles: RankingArticle[], rows: ViewRow[], now: Date = new Date()): RankingRow[] {
  const todayStart = startOfJstDay(now).getTime();
  const weekStart = todayStart - 6 * DAY_MS;
  const monthStart = todayStart - 29 * DAY_MS;
  const yesterdayStart = todayStart - DAY_MS;
  const stats = new Map<string, { today: number; yesterday: number; week: number; month: number }>();
  for (const row of rows) {
    const t = row.createdAt.getTime();
    if (t < monthStart) continue;
    const s = stats.get(row.articleId) ?? { today: 0, yesterday: 0, week: 0, month: 0 };
    s.month += 1;
    if (t >= weekStart) s.week += 1;
    if (t >= todayStart) s.today += 1;
    else if (t >= yesterdayStart) s.yesterday += 1;
    stats.set(row.articleId, s);
  }
  return articles.map((a) => {
    const s = stats.get(a.id) ?? { today: 0, yesterday: 0, week: 0, month: 0 };
    return {
      id: a.id,
      title: a.title,
      slug: a.slug,
      categoryName: a.category.name,
      publishedAt: a.publishedAt,
      today: s.today,
      yesterday: s.yesterday,
      week: s.week,
      month: s.month,
      total: a.viewCount,
    };
  });
}

export type Matrix = {
  keys: string[];
  rows: { id: string; title: string; slug: string; total: number; counts: number[] }[];
  dayTotals: number[];
  max: number;
};

/** 記事×日付の閲覧数。期間内の閲覧数が多い上位 limit 件の記事を、日別に並べる。 */
export function buildMatrix(
  articles: { id: string; title: string; slug: string }[],
  rows: ViewRow[],
  days: number,
  limit: number
): Matrix {
  const { keys } = recentDays(days);
  const index = new Map(keys.map((key, i) => [key, i]));
  const meta = new Map(articles.map((a) => [a.id, a]));
  const perArticle = new Map<string, number[]>();
  const dayTotals = keys.map(() => 0);
  for (const row of rows) {
    const i = index.get(jstDateKey(row.createdAt));
    if (i === undefined || !meta.has(row.articleId)) continue;
    const counts = perArticle.get(row.articleId) ?? keys.map(() => 0);
    counts[i] += 1;
    perArticle.set(row.articleId, counts);
    dayTotals[i] += 1;
  }
  const list = [...perArticle.entries()]
    .map(([id, counts]) => ({
      id,
      title: meta.get(id)!.title,
      slug: meta.get(id)!.slug,
      total: counts.reduce((sum, n) => sum + n, 0),
      counts,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  const max = Math.max(1, ...list.flatMap((r) => r.counts));
  return { keys, rows: list, dayTotals, max };
}
