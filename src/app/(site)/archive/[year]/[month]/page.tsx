import type { Metadata } from "next";
import { ArticleListingLayout } from "@/components/article/ArticleListingLayout";
import { getArticlesPage } from "@/lib/queries";
import { jstMonthRange } from "@/lib/jst";

export async function generateMetadata({ params }: PageProps<"/archive/[year]/[month]">): Promise<Metadata> {
  const { year, month } = await params;
  return {
    title: `${year}年${month}月の記事`,
    description: `${year}年${month}月に公開した記事の一覧です。`,
  };
}

export default async function ArchivePage({ params, searchParams }: PageProps<"/archive/[year]/[month]">) {
  const { year, month } = await params;
  const { page: pageParam } = await searchParams;

  const yearNum = Number(year);
  const monthNum = Number(month);
  // 旧サイトと同じく、日本時間の月で区切る(サーバーはUTCのため、new Date(y, m, 1) だと9時間ずれる)
  const { from, to } = jstMonthRange(yearNum, monthNum);

  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;
  const result = await getArticlesPage({
    where: { publishedAt: { gte: from, lt: to } },
    page,
  });

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
