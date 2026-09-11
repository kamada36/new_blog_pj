import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleListingLayout } from "@/components/article/ArticleListingLayout";
import { getArticlesPage, getTagBySlug } from "@/lib/queries";

export async function generateMetadata({ params }: PageProps<"/tag/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTagBySlug(decodeURIComponent(slug));
  if (!tag) return {};
  return {
    title: `タグ: ${tag.name}`,
    description: `「${tag.name}」タグが付いた記事の一覧です。`,
  };
}

export default async function TagPage({ params, searchParams }: PageProps<"/tag/[slug]">) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const tag = await getTagBySlug(decodeURIComponent(slug));
  if (!tag) notFound();

  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;
  const result = await getArticlesPage({ where: { tags: { some: { id: tag.id } } }, page });

  return (
    <ArticleListingLayout
      title={`タグ: ${tag.name}`}
      articles={result.items}
      page={result.page}
      totalPages={result.totalPages}
      basePath={`/tag/${tag.slug}`}
    />
  );
}
