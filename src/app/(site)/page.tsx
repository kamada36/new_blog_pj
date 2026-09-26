import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { Sidebar } from "@/components/layout/Sidebar";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { ArticleCard } from "@/components/article/ArticleCard";
import { ArticleRowCard } from "@/components/article/ArticleRowCard";
import { IconMug } from "@/components/icons/CafeIcons";
import {
  getArticlesByCategory,
  getCategories,
  getPopularArticles,
  getPrimaryAuthor,
  getRecentArticles,
  getSiteSetting,
} from "@/lib/queries";
import { getAdminViewStatsForArticles } from "@/lib/adminView";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CATCHPHRASE = "この一杯から始まる、IT転職への道しるべ";

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

  const viewStatsMap = await getAdminViewStatsForArticles([
    ...recentArticles,
    ...categorySections.flatMap((section) => section.articles),
    ...popularArticles,
  ]);

  const hasHeroBg = Boolean(siteSetting.heroBackgroundUrl);

  return (
    <div className="pb-20">
      <section
        className={`relative overflow-hidden border-b border-border ${
          hasHeroBg ? "" : "bg-gradient-to-b from-accent-soft/60 to-background"
        }`}
      >
        {siteSetting.heroBackgroundUrl && (
          <>
            <Image src={siteSetting.heroBackgroundUrl} alt="" fill priority className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-foreground/65 via-foreground/45 to-foreground/70" />
          </>
        )}

        {siteSetting.heroCharacterResilientUrl && (
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-28 sm:block sm:w-36 lg:w-44">
            <Image
              src={siteSetting.heroCharacterResilientUrl}
              alt="レジサン"
              fill
              sizes="180px"
              className="object-contain object-bottom drop-shadow-xl"
            />
          </div>
        )}
        {siteSetting.heroCharacterAikoUrl && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-28 sm:block sm:w-36 lg:w-44">
            <Image
              src={siteSetting.heroCharacterAikoUrl}
              alt="アイコ"
              fill
              sizes="180px"
              className="object-contain object-bottom drop-shadow-xl"
            />
          </div>
        )}

        <Container
          className={`relative z-10 flex flex-col items-center gap-4 py-16 text-center sm:py-24 ${
            hasHeroBg ? "text-white" : "text-foreground"
          }`}
        >
          <p className="hero-reveal font-brand text-3xl italic tracking-wide opacity-95 [animation-delay:0ms] sm:text-5xl">
            Resilient-cer cafe
          </p>
          <p className="hero-reveal flex items-center justify-center gap-3 font-display text-xs font-medium tracking-[0.25em] opacity-70 [animation-delay:300ms] sm:text-sm">
            <span className="h-px w-5 bg-current/30" />
            レジリエンサーカフェ
            <span className="h-px w-5 bg-current/30" />
          </p>

          <h1 className="hero-reveal font-display text-xl font-bold tracking-tight [animation-delay:650ms] sm:text-3xl">
            {siteSetting.tagline}
          </h1>

          <p className="hero-reveal text-xs tracking-wide opacity-60 [animation-delay:950ms]">{siteUrl}</p>

          <p
            className={`hero-underline mt-1 font-display text-base sm:text-lg ${
              hasHeroBg ? "text-white/95" : "text-foreground"
            }`}
          >
            {CATCHPHRASE.split("").map((char, index) => (
              <span
                key={index}
                className="hero-char inline-block"
                style={{ animationDelay: `${1200 + index * 45}ms` }}
              >
                {char === " " ? " " : char}
              </span>
            ))}
          </p>

          <Link
            href="/about"
            className="hero-reveal group relative inline-flex items-center gap-1.5 rounded-full border border-current/30 px-6 py-2 text-sm tracking-wide transition-all duration-500 ease-out [animation-delay:2650ms] hover:-translate-y-0.5 hover:border-current/55 hover:shadow-lg"
          >
            About
            <span className="inline-block w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-500 ease-out group-hover:w-4 group-hover:opacity-100">
              →
            </span>
          </Link>

        </Container>
      </section>

      <p className="py-3 text-center text-[11px] tracking-wide text-foreground-muted">
        当サイトは広告収入を含むアフィリエイトリンクを利用しています。
      </p>

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
                  <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
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
              <section className="mt-16">
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
              <section className="mt-16">
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
