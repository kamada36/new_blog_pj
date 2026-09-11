import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { ArticleCard } from "@/components/article/ArticleCard";
import { IconMug } from "@/components/icons/CafeIcons";
import {
  getArticlesByCategory,
  getCategories,
  getPopularArticles,
  getPrimaryAuthor,
  getRecentArticles,
  getSiteSetting,
} from "@/lib/queries";

export default async function HomePage() {
  const [siteSetting, categories, recentArticles, popularArticles, author] = await Promise.all([
    getSiteSetting(),
    getCategories(),
    getRecentArticles(4),
    getPopularArticles(5),
    getPrimaryAuthor(),
  ]);

  const categorySections = await Promise.all(
    categories.map(async (category) => ({
      category,
      articles: await getArticlesByCategory(category.id, 4),
    }))
  );

  return (
    <div className="pb-20">
      <section className="border-b border-border bg-gradient-to-b from-accent-soft/60 to-background">
        <Container className="flex flex-col items-center gap-5 py-16 text-center sm:py-24">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-sm">
            <IconMug className="h-8 w-8 text-accent" />
          </span>
          <h1 className="font-display text-2xl font-black tracking-tight sm:text-4xl">{siteSetting.tagline}</h1>
          <p className="max-w-xl text-sm text-foreground-muted sm:text-base">
            この一杯から始まる、IT転職への道しるべ。未経験からのIT転職とキャリアの考え方を、実体験を交えてお届けします。
          </p>
          <Link
            href="/about"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-dark"
          >
            サイト概要を見る
          </Link>
        </Container>
      </section>

      <Container className="mt-14">
        <CategoryTiles categories={categories} />
      </Container>

      {recentArticles.length > 0 && (
        <Container className="mt-16">
          <SectionHeading title="新着記事" />
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {recentArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </Container>
      )}

      {categorySections
        .filter((section) => section.articles.length > 0)
        .map((section) => (
          <Container key={section.category.id} className="mt-16">
            <SectionHeading
              title={section.category.name}
              href={`/category/${section.category.slug}`}
            />
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {section.articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </Container>
        ))}

      {author && (
        <Container className="mt-20">
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
        </Container>
      )}

      {popularArticles.length > 0 && (
        <Container className="mt-16">
          <SectionHeading title="人気記事" />
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {popularArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </Container>
      )}
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
