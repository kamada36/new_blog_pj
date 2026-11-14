import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { contentPath } from "@/lib/slug";
import { jstDateKey } from "@/lib/viewAnalytics";
import { addDaysToDateKey } from "@/lib/sns/schedule";
import { getSnsSettings, getSnsStats } from "@/lib/sns/store";
import { GeneratePanel } from "./GeneratePanel";
import { PostList, type SnsPostRow } from "./PostList";
import { SchedulePanel } from "./SchedulePanel";

// 紹介文の作成(Server Action)はAIを何度も呼ぶため、時間がかかる。このページから呼ぶServer Actionの実行時間の上限を引き上げる。
export const maxDuration = 300;

const PER_PAGE = 20;

const FILTERS = {
  draft: { label: "承認待ち", where: { status: "draft" } },
  unscheduled: { label: "承認済み・日付未定", where: { status: "approved", scheduledDate: null } },
  scheduled: { label: "割り当て済み", where: { status: "approved", scheduledDate: { not: null } } },
  skipped: { label: "スキップ", where: { status: "skipped" } },
  all: { label: "すべて", where: {} },
} as const satisfies Record<string, { label: string; where: Prisma.SnsPostWhereInput }>;

type FilterKey = keyof typeof FILTERS;

function isFilterKey(value: string): value is FilterKey {
  return value in FILTERS;
}

export default async function AdminSnsPage({ searchParams }: PageProps<"/admin/sns">) {
  const params = await searchParams;
  const param = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const filter: FilterKey = isFilterKey(param("filter")) ? (param("filter") as FilterKey) : "draft";
  const q = param("q").trim();
  const page = Math.max(1, Number.parseInt(param("page"), 10) || 1);

  const where: Prisma.SnsPostWhereInput = {
    ...FILTERS[filter].where,
    ...(q ? { article: { title: { contains: q, mode: "insensitive" } } } : {}),
  };
  // 割り当て済みは日付順、それ以外は新しい記事から
  const orderBy: Prisma.SnsPostOrderByWithRelationInput[] =
    filter === "scheduled"
      ? [{ scheduledDate: "asc" }, { scheduledTime: "asc" }, { slot: "asc" }]
      : [{ article: { publishedAt: "desc" } }, { articleId: "asc" }, { variant: "asc" }];

  const [stats, settings, total, rows] = await Promise.all([
    getSnsStats(),
    getSnsSettings(),
    prisma.snsPost.count({ where }),
    prisma.snsPost.findMany({
      where,
      orderBy,
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        variant: true,
        mainText: true,
        replyBody: true,
        status: true,
        scheduledDate: true,
        slot: true,
        scheduledTime: true,
        replyTime: true,
        updatedAt: true,
        article: { select: { title: true, slug: true, status: true } },
      },
    }),
  ]);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const posts: SnsPostRow[] = rows.map((row) => ({
    id: row.id,
    title: row.article.title,
    articleStatus: row.article.status,
    url: `${siteUrl}${contentPath(row.article.slug)}`,
    variant: row.variant,
    mainText: row.mainText,
    replyBody: row.replyBody,
    status: row.status,
    scheduledDate: row.scheduledDate,
    slot: row.slot,
    scheduledTime: row.scheduledTime,
    replyTime: row.replyTime,
    updatedKey: row.updatedAt.toISOString(),
  }));

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const today = jstDateKey(new Date());
  const href = (next: { filter?: FilterKey; page?: number }) => {
    const search = new URLSearchParams();
    search.set("filter", next.filter ?? filter);
    if (q) search.set("q", q);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    return `/admin/sns?${search.toString()}`;
  };

  return (
    <div>
      <h1 className="font-display text-xl font-black">SNS投稿</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        記事の紹介投稿(X・Threads)の文面をAIで作り、確認・承認して、投稿日と時間枠を割り当てます。結果は、スプレッドシートの投稿ツールへ読み込むCSV(投稿日, 投稿時間枠, 投稿内容)として出力します。
        メイン投稿にはリンクを入れず、記事の紹介とリンクは返信(ツリー)の投稿に置きます。
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "公開記事", value: stats.publishedArticles },
          { label: "文面作成済みの記事", value: stats.articlesWithPosts },
          { label: "承認待ち", value: stats.draft },
          { label: "承認済み・日付未定", value: stats.approvedUnscheduled },
          { label: "今日以降の予定", value: stats.scheduledUpcoming },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <dt className="text-xs text-foreground-muted">{stat.label}</dt>
            <dd className="mt-1 text-xl font-bold">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-col gap-4">
        <GeneratePanel publishedArticles={stats.publishedArticles} articlesWithPosts={stats.articlesWithPosts} />
        <SchedulePanel
          approvedUnscheduled={stats.approvedUnscheduled}
          today={today}
          defaultTo={addDaysToDateKey(today, 30)}
          frames={settings.frames}
          replyDelayMin={settings.replyDelayMin}
          replyDelayMax={settings.replyDelayMax}
        />
      </div>

      <h2 className="mt-8 text-sm font-bold">投稿の一覧</h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5 text-xs">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
            <Link
              key={key}
              href={href({ filter: key })}
              className={`rounded-full border px-3 py-1 font-semibold ${
                key === filter ? "border-accent bg-accent-soft text-accent-dark" : "border-border hover:border-accent hover:text-accent-dark"
              }`}
            >
              {FILTERS[key].label}
            </Link>
          ))}
        </nav>
        <form action="/admin/sns/" method="get" className="flex gap-2">
          <input type="hidden" name="filter" value={filter} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="記事タイトルで検索"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark">
            検索
          </button>
        </form>
      </div>
      <p className="mt-3 text-xs text-foreground-muted">{total}件</p>

      <PostList posts={posts} slotCount={settings.frames.length} />

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="text-accent-dark hover:underline">
              ← 前へ
            </Link>
          ) : (
            <span className="text-foreground-muted">← 前へ</span>
          )}
          <span className="text-foreground-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={href({ page: page + 1 })} className="text-accent-dark hover:underline">
              次へ →
            </Link>
          ) : (
            <span className="text-foreground-muted">次へ →</span>
          )}
        </nav>
      )}
    </div>
  );
}
