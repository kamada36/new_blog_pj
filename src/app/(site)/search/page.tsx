import type { Metadata } from "next";
import { ArticleListingLayout } from "@/components/article/ArticleListingLayout";
import { getArticlesPage } from "@/lib/queries";

export const metadata: Metadata = {
  title: "検索結果",
};

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q, page: pageParam } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;

  const result = query
    ? await getArticlesPage({
        where: {
          OR: [
            { title: { contains: query } },
            { excerpt: { contains: query } },
            { contentMarkdown: { contains: query } },
          ],
        },
        page,
      })
    : { items: [], total: 0, page: 1, totalPages: 1 };

  const basePath = `/search?q=${encodeURIComponent(query)}`;

  return (
    <ArticleListingLayout
      title={query ? `「${query}」の検索結果` : "記事を検索"}
      description={
        query
          ? `${result.total}件の記事が見つかりました。`
          : "キーワードを入力して記事を検索できます。"
      }
      articles={result.items}
      page={result.page}
      totalPages={result.totalPages}
      basePath={basePath}
    />
  );
}
