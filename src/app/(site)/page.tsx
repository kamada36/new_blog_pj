import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { Sidebar } from "@/components/layout/Sidebar";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { Hero } from "@/components/home/Hero";
import { ArticleCard } from "@/components/article/ArticleCard";
import { ArticleRowCard } from "@/components/article/ArticleRowCard";
import { IconMug } from "@/components/icons/CafeIcons";
import {
  getCategories,
  getLatestArticlesByCategory,
  getPopularArticles,
  getPrimaryAuthor,
  getRecentArticles,
  getSiteSetting,
} from "@/lib/queries";
import { getAdminViewStatsForArticles } from "@/lib/adminView";


export default async function HomePage() {
  const [siteSetting, categories, recentArticles, popularArticles, author, latestByCategory] = await Promise.all([
    getSiteSetting(),
    getCategories(),
    getRecentArticles(4),
    getPopularArticles(5),
    getPrimaryAuthor(),
    getLatestArticlesByCategory(4),
  ]);

  const categorySections = categories.map((category) => ({
    category,
    articles: latestByCategory.get(category.id) ?? [],
  }));

  const viewStatsMap = await getAdminViewStatsForArticles([
    ...recentArticles,
    ...categorySections.flatMap((section) => section.articles),
    ...popularArticles,
  ]);

  return (
    <div className="pb-20">
      <Hero
        tagline={siteSetting.tagline}
        backgroundUrl={siteSetting.heroBackgroundUrl}
        backgroundMobileUrl={siteSetting.heroBackgroundMobileUrl}
        characterResilientUrl={siteSetting.heroCharacterResilientUrl}
        characterAikoUrl={siteSetting.heroCharacterAikoUrl}
      />

      {/* 見出しの直下に隙間なく続ける、上下2段のコーヒー色の帯 */}
      <div className="hero-disclaimer">
        <div aria-hidden className="hero-disclaimer-top" />
        <p className="hero-disclaimer-bottom px-3 py-2 text-center text-[11px] tracking-normal sm:px-4 sm:text-[13px] sm:tracking-wide">
          {/* 折り返すときは語の途中で切らず、2つのまとまりの間だけで改行する */}
          <span className="inline-block">当サイトは広告収入を含む</span>
          <span className="inline-block">アフィリエイトリンクを利用しています。</span>
        </p>
      </div>

      <Container className="mt-14">
        <CategoryTiles categories={categories} />
      </Container>

      <Container className="mt-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
          <div>
            {recentArticles.length > 0 && (
              <section>
                <SectionHeading title="新着記事" />
                <div className="mt-6 grid grid-cols-2 gap-4">
                  {recentArticles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      viewStats={viewStatsMap?.get(article.id) ?? null}
                    />
                  ))}
                </div>
              </section>
            )}

            {categorySections
              .filter((section) => section.articles.length > 0)
              .map((section) => (
                <section key={section.category.id} className="mt-14">
                  <SectionHeading
                    title={section.category.name}
                    href={`/category/${section.category.slug}`}
                  />
                  <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                    {section.articles.map((article) => (
                      <ArticleRowCard
                        key={article.id}
                        article={article}
                        size="md"
                        viewStats={viewStatsMap?.get(article.id) ?? null}
                      />
                    ))}
                  </div>
                </section>
              ))}

            {author && (
              <section className="mt-16 hidden lg:block">
                <div className="flex flex-col items-center gap-6 rounded-3xl border border-border bg-surface p-8 text-center sm:flex-row sm:text-left">
                  {author.avatarUrl ? (
                    <Image
                      src={author.avatarUrl}
                      alt={author.name}
                      width={112}
                      height={112}
                      className="h-28 w-28 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                      <IconMug className="h-10 w-10 text-accent-dark" />
                    </div>
                  )}
                  <div>
                    <p className="font-display text-sm font-bold text-foreground-muted">管理人プロフィール</p>
                    <h2 className="mt-1 font-display text-xl font-black">{author.name}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{author.bio}</p>
                    <div className="mt-4 flex justify-center gap-3 sm:justify-start">
                      {author.snsX && (
                        <a
                          href={author.snsX}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark"
                        >
                          X (Twitter)
                        </a>
                      )}
                      {author.snsThreads && (
                        <a
                          href={author.snsThreads}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark"
                        >
                          Threads
                        </a>
                      )}
                      <Link
                        href="/profile"
                        className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-dark"
                      >
                        詳しいプロフィール
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {popularArticles.length > 0 && (
              <section className="mt-16 hidden lg:block">
                <SectionHeading title="人気記事" />
                <div className="mt-6 flex flex-col gap-4">
                  {popularArticles.map((article) => (
                    <ArticleRowCard
                      key={article.id}
                      article={article}
                      size="md"
                      viewStats={viewStatsMap?.get(article.id) ?? null}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          <Sidebar />
        </div>
      </Container>
    </div>
  );
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between border-b border-border pb-3">
      <h2 className="font-display text-xl font-black sm:text-2xl">{title}</h2>
      {href && (
        <Link href={href} className="text-sm font-semibold text-accent-dark hover:underline">
          もっと見る →
        </Link>
      )}
    </div>
  );
}
