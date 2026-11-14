import "server-only";
import { prisma } from "@/lib/prisma";
import { jstDateKey } from "@/lib/viewAnalytics";
import { contentPath } from "@/lib/slug";
import { mapWithConcurrency } from "@/lib/ai/linkIndex";
import { describeAiError } from "@/lib/ai/provider";
import { generateSnsPosts, type SnsArticleSource } from "./generate";
import {
  DEFAULT_REPLY_DELAY,
  DEFAULT_TIME_FRAMES,
  isTimeKey,
  minutesToTime,
  parseTimeFrames,
  SNS_VARIANT_NUMBERS,
  stringifyTimeFrames,
  timeToMinutes,
  type TimeFrame,
} from "./format";
import { addDaysToDateKey, assignSlots, pickTimes, type PickedTimes } from "./schedule";

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
  days: number;
}): Promise<{ scheduled: number; unscheduled: number }> {
  const now = new Date();
  const startDate = addDaysToDateKey(jstDateKey(now), 1);
  const settings = await getSnsSettings();

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
    slotCount: settings.frames.length,
    minGapDays: MIN_GAP_DAYS,
  });

  // 日付・枠と一緒に、メインと返信の時刻も決める(同じ日の他の投稿と、同じ分にならないようにする)
  const times = await pickTimesFor(assignments, settings);
  const timeById = new Map(times.map((t) => [t.id, t]));
  await prisma.$transaction(
    assignments.map((a) =>
      prisma.snsPost.update({
        where: { id: a.id },
        data: {
          scheduledDate: a.date,
          slot: a.slot,
          scheduledTime: timeById.get(a.id)?.time ?? null,
          replyTime: timeById.get(a.id)?.replyTime ?? null,
        },
      })
    )
  );
  return { scheduled: assignments.length, unscheduled: pending.length - assignments.length };
}

/** 明日以降に割り当てた日付・枠・時刻を解除する(今日以前の分は、すでにツールへ渡した可能性があるため残す)。 */
export async function clearUpcomingSchedule(): Promise<number> {
  const tomorrow = addDaysToDateKey(jstDateKey(new Date()), 1);
  const result = await prisma.snsPost.updateMany({
    where: { scheduledDate: { gte: tomorrow } },
    data: { scheduledDate: null, slot: null, scheduledTime: null, replyTime: null },
  });
  return result.count;
}

// ─── 設定(時間枠・返信までの間隔) ─────────────────────────────────────────

const SETTING_ID = "default";

export interface SnsSettings {
  frames: TimeFrame[];
  replyDelayMin: number;
  replyDelayMax: number;
}

export async function getSnsSettings(): Promise<SnsSettings> {
  const row = await prisma.snsSetting.findUnique({ where: { id: SETTING_ID } });
  return {
    frames: parseTimeFrames(row?.timeFrames ?? DEFAULT_TIME_FRAMES) ?? parseTimeFrames(DEFAULT_TIME_FRAMES)!,
    replyDelayMin: row?.replyDelayMin ?? DEFAULT_REPLY_DELAY.min,
    replyDelayMax: row?.replyDelayMax ?? DEFAULT_REPLY_DELAY.max,
  };
}

export async function saveSnsSettings(settings: SnsSettings): Promise<void> {
  const data = {
    timeFrames: stringifyTimeFrames(settings.frames),
    replyDelayMin: settings.replyDelayMin,
    replyDelayMax: settings.replyDelayMax,
  };
  await prisma.snsSetting.upsert({ where: { id: SETTING_ID }, create: { id: SETTING_ID, ...data }, update: data });
}

// ─── 投稿時刻 ─────────────────────────────────────────────────────────────

/** 指定の日付に、すでに決まっている時刻(メイン・返信とも)を、分で表して集める。除外するIDの投稿は数えない。 */
async function loadUsedMinutes(dates: string[], excludeIds: string[]): Promise<Map<string, number[]>> {
  const used = new Map<string, number[]>();
  if (dates.length === 0) return used;
  const rows = await prisma.snsPost.findMany({
    where: { scheduledDate: { in: dates }, id: { notIn: excludeIds }, status: "approved" },
    select: { scheduledDate: true, scheduledTime: true, replyTime: true },
  });
  for (const row of rows) {
    if (!row.scheduledDate) continue;
    const list = used.get(row.scheduledDate) ?? [];
    for (const time of [row.scheduledTime, row.replyTime]) if (time && isTimeKey(time)) list.push(timeToMinutes(time));
    used.set(row.scheduledDate, list);
  }
  return used;
}

/** 日付・枠の決まった投稿に、メインと返信の時刻を決める(DBには書かない)。 */
async function pickTimesFor(
  targets: { id: string; date: string; slot: number }[],
  settings: SnsSettings
): Promise<PickedTimes[]> {
  const usedByDate = await loadUsedMinutes([...new Set(targets.map((t) => t.date))], targets.map((t) => t.id));
  return pickTimes({
    targets,
    frames: settings.frames,
    usedByDate,
    delay: { min: settings.replyDelayMin, max: settings.replyDelayMax },
  });
}

/** 1件の投稿の、日付・枠から時刻を決める(管理画面で日付や枠を手で変えたとき、時刻が空のときに使う)。 */
export async function pickTimesForPost(id: string, date: string, slot: number): Promise<PickedTimes | null> {
  const settings = await getSnsSettings();
  const [picked] = await pickTimesFor([{ id, date, slot }], settings);
  return picked ?? null;
}

/** メインの時刻から、返信の時刻(数分後。同じ日に収める)を決める。メインを手で指定したとき用。 */
export async function pickReplyTime(mainTime: string): Promise<string> {
  const { replyDelayMin, replyDelayMax } = await getSnsSettings();
  const delay = replyDelayMin + Math.floor(Math.random() * (replyDelayMax - replyDelayMin + 1));
  return minutesToTime(Math.min(timeToMinutes(mainTime) + delay, 23 * 60 + 59));
}

/** 日付・枠はあるのに時刻が未設定の、承認済みの投稿(今日以降)に、時刻を決めて保存する。 */
export async function fillMissingTimes(): Promise<number> {
  const today = jstDateKey(new Date());
  const rows = await prisma.snsPost.findMany({
    where: {
      status: "approved",
      scheduledDate: { gte: today },
      slot: { not: null },
      OR: [{ scheduledTime: null }, { replyTime: null }],
    },
    select: { id: true, scheduledDate: true, slot: true },
  });
  const targets = rows.flatMap((r) => (r.scheduledDate && r.slot ? [{ id: r.id, date: r.scheduledDate, slot: r.slot }] : []));
  const picked = await pickTimesFor(targets, await getSnsSettings());
  await prisma.$transaction(
    picked.map((p) => prisma.snsPost.update({ where: { id: p.id }, data: { scheduledTime: p.time, replyTime: p.replyTime } }))
  );
  return picked.length;
}

export interface QueueRow {
  id: string;
  articleId: string;
  title: string;
  url: string;
  date: string;
  slot: number;
  /** メイン・返信の時刻(HH:mm)。未設定ならnull */
  time: string | null;
  replyTime: string | null;
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
    orderBy: [{ scheduledDate: "asc" }, { scheduledTime: "asc" }, { slot: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      articleId: true,
      mainText: true,
      replyBody: true,
      scheduledDate: true,
      scheduledTime: true,
      replyTime: true,
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
        time: p.scheduledTime,
        replyTime: p.replyTime,
        mainText: p.mainText,
        // 返信の本文の後に、空行を1つ空けてURLを置く
        replyText: `${p.replyBody}\n\n${url}`,
      },
    ];
  });
}
