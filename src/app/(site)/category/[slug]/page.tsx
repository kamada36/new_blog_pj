import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleListingLayout } from "@/components/article/ArticleListingLayout";
import { getArticlesPage, getCategoryBySlug } from "@/lib/queries";

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(decodeURIComponent(slug));
  if (!category) return {};
  return {
    title: category.name,
    description: category.description || `${category.name}カテゴリーの記事一覧です。`,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const category = await getCategoryBySlug(decodeURIComponent(slug));
  if (!category) notFound();

  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;
  const result = await getArticlesPage({ where: { categoryId: category.id }, page });

  return (
    <ArticleListingLayout
      title={category.name}
      description={category.description}
      articles={result.items}
      page={result.page}
      totalPages={result.totalPages}
      basePath={`/category/${category.slug}`}
    />
  );
}
