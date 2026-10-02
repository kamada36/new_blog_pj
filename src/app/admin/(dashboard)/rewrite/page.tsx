import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { RewriteWorkbench, type RewriteRow } from "./RewriteWorkbench";

const PER_PAGE = 10;

const SORT_OPTIONS = {
  updated_asc: { label: "更新日が古い順(リライト向き)", orderBy: { updatedAt: "asc" } },
  updated_desc: { label: "更新日が新しい順", orderBy: { updatedAt: "desc" } },
  published_asc: { label: "公開日が古い順", orderBy: { publishedAt: "asc" } },
  published_desc: { label: "公開日が新しい順", orderBy: { publishedAt: "desc" } },
  views_desc: { label: "閲覧数が多い順", orderBy: { viewCount: "desc" } },
  title_asc: { label: "タイトル順", orderBy: { title: "asc" } },
} as const satisfies Record<string, { label: string; orderBy: Prisma.ArticleOrderByWithRelationInput }>;

type SortKey = keyof typeof SORT_OPTIONS;

const LOG_STATUS: Record<string, { label: string; className: string }> = {
  success: { label: "成功", className: "bg-green-100 text-green-800" },
  failed: { label: "失敗", className: "bg-red-50 text-red-600" },
  reverted: { label: "元に戻した", className: "bg-surface-muted text-foreground-muted" },
};

function isSortKey(value: string): value is SortKey {
  return value in SORT_OPTIONS;
}

export default async function AdminRewritePage({ searchParams }: PageProps<"/admin/rewrite">) {
  const params = await searchParams;
  const getParam = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  const q = getParam("q").trim();
  const status = getParam("status");
  const sortParam = getParam("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "updated_asc";
  const page = Math.max(1, Number.parseInt(getParam("page"), 10) || 1);

  const where: Prisma.ArticleWhereInput = {
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(status ? { status } : {}),
  };

  const [total, articles, logs, publishedCount] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy: SORT_OPTIONS[sort].orderBy,
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        updatedAt: true,
        publishedAt: true,
        contentMarkdown: true,
        category: { select: { name: true } },
        rewriteBackup: { select: { createdAt: true } },
      },
    }),
    prisma.articleRewriteLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.article.count({ where: { status: "published" } }),
  ]);

  // 本文そのものはクライアントへ渡さない(文字数だけ)
  const rows: RewriteRow[] = articles.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    status: a.status,
    updatedAt: a.updatedAt.toISOString(),
    publishedAt: a.publishedAt?.toISOString() ?? null,
    contentLength: a.contentMarkdown.length,
    categoryName: a.category.name,
    pending: a.rewriteBackup !== null,
  }));

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (status) search.set("status", status);
    if (sortParam) search.set("sort", sortParam);
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return `/admin/rewrite${qs ? `?${qs}` : ""}`;
  };

  const keys = {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  };

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-black">AIリライト</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          既存記事を、コメント(指示)に沿ってAIでリライトします。実行すると記事の本文が<strong>直ちに上書き</strong>されますが、
          「この内容で確定」するまでは「元に戻す」でリライト前の状態に復元できます(公開中の記事は{publishedCount}件)。
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="min-w-[180px] flex-1">
          <label className="text-xs font-semibold text-foreground-muted">タイトル検索</label>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="タイトルで検索"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="min-w-[120px]">
          <label className="text-xs font-semibold text-foreground-muted">状態</label>
          <select
            name="status"
            defaultValue={status}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">すべて</option>
            <option value="published">公開中</option>
            <option value="draft">下書き</option>
            <option value="private">非公開</option>
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="text-xs font-semibold text-foreground-muted">並び替え</label>
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {Object.entries(SORT_OPTIONS).map(([key, option]) => (
              <option key={key} value={key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          絞り込む
        </button>
        {(q || status || sortParam) && (
          <Link href="/admin/rewrite" className="text-sm text-foreground-muted hover:underline">
            条件をリセット
          </Link>
        )}
      </form>

      <RewriteWorkbench rows={rows} keys={keys} />

      <nav className="flex items-center justify-between text-sm" aria-label="ページ送り">
        <span className="text-foreground-muted">
          {total}件中 {total === 0 ? 0 : (page - 1) * PER_PAGE + 1}〜{Math.min(page * PER_PAGE, total)}件
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="rounded-full border border-border px-4 py-1.5 font-semibold hover:border-accent">
              ← 前へ
            </Link>
          )}
          <span className="px-2 py-1.5 text-foreground-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="rounded-full border border-border px-4 py-1.5 font-semibold hover:border-accent">
              次へ →
            </Link>
          )}
        </div>
      </nav>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-bold">リライト履歴(直近20件)</h2>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">まだ履歴はありません。</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LOG_STATUS[log.status]?.className ?? ""}`}>
                    {LOG_STATUS[log.status]?.label ?? log.status}
                  </span>
                  <Link href={`/admin/articles/${log.articleId}`} className="font-semibold hover:text-accent-dark hover:underline">
                    {log.articleTitle}
                  </Link>
                  <span className="text-xs text-foreground-muted">
                    {log.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" })}
                    {log.model && ` ・ ${log.model}`}
                  </span>
                </div>
                {log.summary && <p className="mt-1 text-xs text-foreground-muted">{log.summary}</p>}
                {log.errorMessage && <p className="mt-1 text-xs text-red-600">{log.errorMessage}</p>}
                {log.instruction && <p className="mt-1 text-xs text-foreground-muted">指示: {log.instruction}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
