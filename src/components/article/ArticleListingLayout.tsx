import { ArticleCard, type ArticleCardData } from "@/components/article/ArticleCard";
import { Pagination } from "@/components/article/Pagination";
import { Sidebar } from "@/components/layout/Sidebar";
import { Container } from "@/components/layout/Container";
import { getAdminViewStatsForArticles } from "@/lib/adminView";

export async function ArticleListingLayout({
  title,
  description,
  articles,
  page,
  totalPages,
  basePath,
}: {
  title: string;
  description?: string;
  articles: ArticleCardData[];
  page: number;
  totalPages: number;
  basePath: string;
}) {
  const viewStatsMap = await getAdminViewStatsForArticles(articles);

  return (
    <Container className="py-12">
      <header className="border-b border-border pb-5">
        <h1 className="font-display text-2xl font-black">{title}</h1>
        {description && <p className="mt-2 text-sm text-foreground-muted">{description}</p>}
      </header>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          {articles.length === 0 ? (
            <p className="py-16 text-center text-sm text-foreground-muted">まだ記事がありません。</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  viewStats={viewStatsMap?.get(article.id) ?? null}
                />
              ))}
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} basePath={basePath} />
        </div>
        <Sidebar />
      </div>
    </Container>
  );
}
