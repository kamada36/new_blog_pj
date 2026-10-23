import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleListingLayout } from "@/components/article/ArticleListingLayout";
import { getArticlesPage, getCategoryBySlug, getTagBySlug } from "@/lib/queries";
import { jstMonthRange } from "@/lib/jst";
import { decodeSlug, encodeSlug } from "@/lib/slug";

// カテゴリー・タグ・月別アーカイブの一覧ページ(1ページ目と、2ページ目以降で共通)。
// ページ送りを「?page=N」ではなく、旧WordPressと同じ「/page/N/」のパスにしたため、どのページも searchParams を
// 使わず、CDNにキャッシュされる(ISR)。2ページ目以降は app/(site)/.../page/[page]/page.tsx から呼ばれる。

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** URLの末尾のページ番号(1以上の整数)。不正な値は null。 */
export function parsePageParam(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

/** 検索エンジンに伝える正規のURL。?page=N などのクエリ付きのアクセスも、このURLに統一される。 */
function canonicalFor(basePath: string, page: number): Metadata["alternates"] {
  return { canonical: `${siteUrl}${basePath}/${page > 1 ? `page/${page}/` : ""}` };
}

const pageSuffix = (page: number) => (page > 1 ? `(${page}ページ目)` : "");

// ── カテゴリー ──
export async function categoryMetadata(rawSlug: string, page: number): Promise<Metadata> {
  const category = await getCategoryBySlug(decodeSlug(rawSlug));
  if (!category) return {};
  return {
    title: `${category.name}${pageSuffix(page)}`,
    description: category.description || `${category.name}カテゴリーの記事一覧です。`,
    alternates: canonicalFor(`/category/${encodeSlug(category.slug)}`, page),
  };
}

export async function CategoryListing({ slug, page }: { slug: string; page: number }) {
  const category = await getCategoryBySlug(decodeSlug(slug));
  if (!category) notFound();

  const result = await getArticlesPage({ where: { categoryId: category.id }, page });
  if (page > 1 && page > result.totalPages) notFound();

  return (
    <ArticleListingLayout
      title={category.name}
      description={category.description}
      articles={result.items}
      page={result.page}
      totalPages={result.totalPages}
      basePath={`/category/${encodeSlug(category.slug)}`}
    />
  );
}

// ── タグ ──
export async function tagMetadata(rawSlug: string, page: number): Promise<Metadata> {
  const tag = await getTagBySlug(decodeSlug(rawSlug));
  if (!tag) return {};
  return {
    title: `タグ: ${tag.name}${pageSuffix(page)}`,
    description: `「${tag.name}」タグが付いた記事の一覧です。`,
    alternates: canonicalFor(`/tag/${encodeSlug(tag.slug)}`, page),
  };
}

export async function TagListing({ slug, page }: { slug: string; page: number }) {
  const tag = await getTagBySlug(decodeSlug(slug));
  if (!tag) notFound();

  const result = await getArticlesPage({ where: { tags: { some: { id: tag.id } } }, page });
  if (page > 1 && page > result.totalPages) notFound();

  return (
    <ArticleListingLayout
      title={`タグ: ${tag.name}`}
      articles={result.items}
      page={result.page}
      totalPages={result.totalPages}
      basePath={`/tag/${encodeSlug(tag.slug)}`}
    />
  );
}

// ── 月別アーカイブ ──
/** 年月が正しい範囲か(/archive/2025/99/ などは存在しないページにする)。 */
function parseYearMonth(year: string, month: string): { year: number; month: number } | null {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) return null;
  const y = Number(year);
  const m = Number(month);
  return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 ? { year: y, month: m } : null;
}

export function archiveMetadata(year: string, month: string, page: number): Metadata {
  return {
    title: `${year}年${month}月の記事${pageSuffix(page)}`,
    description: `${year}年${month}月に公開した記事の一覧です。`,
    alternates: canonicalFor(`/archive/${year}/${month}`, page),
  };
}

export async function ArchiveListing({ year, month, page }: { year: string; month: string; page: number }) {
  const ym = parseYearMonth(year, month);
  if (!ym) notFound();
  // 旧サイトと同じく、日本時間の月で区切る(サーバーはUTCのため、new Date(y, m, 1) だと9時間ずれる)
  const { from, to } = jstMonthRange(ym.year, ym.month);

  const result = await getArticlesPage({ where: { publishedAt: { gte: from, lt: to } }, page });
  if (page > 1 && page > result.totalPages) notFound();

  return (
    <ArticleListingLayout
      title={`${year}年${month}月のアーカイブ`}
      articles={result.items}
      page={result.page}
      totalPages={result.totalPages}
      basePath={`/archive/${year}/${month}`}
    />
  );
}
