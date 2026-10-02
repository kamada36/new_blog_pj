import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAdminViewStatsForArticles } from "@/lib/adminView";
import { ArticlesTable } from "./ArticlesTable";

const SORT_OPTIONS = {
  updated_desc: { label: "更新日が新しい順", orderBy: { updatedAt: "desc" } },
  updated_asc: { label: "更新日が古い順", orderBy: { updatedAt: "asc" } },
  views_desc: { label: "閲覧数が多い順", orderBy: { viewCount: "desc" } },
  views_asc: { label: "閲覧数が少ない順", orderBy: { viewCount: "asc" } },
} as const satisfies Record<string, { label: string; orderBy: Prisma.ArticleOrderByWithRelationInput }>;

type SortKey = keyof typeof SORT_OPTIONS;

function isSortKey(value: string): value is SortKey {
  return value in SORT_OPTIONS;
}

export default async function AdminArticlesPage({ searchParams }: PageProps<"/admin/articles">) {
  const params = await searchParams;
  const getParam = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  const q = getParam("q").trim();
  const categoryId = getParam("categoryId");
  const status = getParam("status");
  const publishedFrom = getParam("publishedFrom");
  const publishedTo = getParam("publishedTo");
  const sortParam = getParam("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "updated_desc";

  const publishedAtFilter: Prisma.DateTimeFilter = {};
  if (publishedFrom && !Number.isNaN(Date.parse(publishedFrom))) {
    publishedAtFilter.gte = new Date(`${publishedFrom}T00:00:00`);
  }
  if (publishedTo && !Number.isNaN(Date.parse(publishedTo))) {
    publishedAtFilter.lte = new Date(`${publishedTo}T23:59:59.999`);
  }
  const hasPublishedAtFilter = Object.keys(publishedAtFilter).length > 0;

  const where: Prisma.ArticleWhereInput = {
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
    ...(hasPublishedAtFilter ? { publishedAt: publishedAtFilter } : {}),
  };

  const [articles, categories] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: SORT_OPTIONS[sort].orderBy,
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
  ]);

  const viewStatsMap = await getAdminViewStatsForArticles(articles);
  const rows = articles.map((article) => ({
    id: article.id,
    title: article.title,
    titleLength: article.title.length,
    contentLength: article.contentMarkdown.length,
    status: article.status,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    coverImageUrl: article.coverImageUrl,
    category: article.category,
    viewStats: viewStatsMap?.get(article.id) ?? null,
  }));

  const hasFilters = Boolean(q || categoryId || status || publishedFrom || publishedTo || sortParam);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-black">記事一覧</h1>
        <Link
          href="/admin/articles/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          新規作成
        </Link>
      </div>

      <form
        method="GET"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4"
      >
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
        <div className="min-w-[140px]">
          <label className="text-xs font-semibold text-foreground-muted">カテゴリー</label>
          <select
            name="categoryId"
            defaultValue={categoryId}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">すべて</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
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
        <div className="min-w-[130px]">
          <label className="text-xs font-semibold text-foreground-muted">公開日（から）</label>
          <input
            type="date"
            name="publishedFrom"
            defaultValue={publishedFrom}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs font-semibold text-foreground-muted">公開日（まで）</label>
          <input
            type="date"
            name="publishedTo"
            defaultValue={publishedTo}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="min-w-[170px]">
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
        {hasFilters && (
          <Link href="/admin/articles" className="text-sm text-foreground-muted hover:underline">
            条件をリセット
          </Link>
        )}
      </form>

      <div className="mt-6">
        <ArticlesTable articles={rows} />
      </div>
    </div>
  );
}
