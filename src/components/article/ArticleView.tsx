import Link from "next/link";
import Image from "next/image";
import { after } from "next/server";
import { Container } from "@/components/layout/Container";
import { Sidebar } from "@/components/layout/Sidebar";
import { ArticleBody } from "@/components/article/ArticleBody";
import { TableOfContents } from "@/components/article/TableOfContents";
import { ShareButtons } from "@/components/article/ShareButtons";
import { ArticleCard } from "@/components/article/ArticleCard";
import { ArticleAdjacentNav } from "@/components/article/ArticleAdjacentNav";
import { IconMug } from "@/components/icons/CafeIcons";
import { formatDate } from "@/lib/format";
import { extractHeadings } from "@/lib/toc";
import {
  getAdjacentArticles,
  getRelatedArticles,
  getShortcodes,
  recordArticleView,
} from "@/lib/queries";
import { getAdminViewStatsForArticles } from "@/lib/adminView";
import { getSessionUser } from "@/lib/auth";
import { getViewRequestContext } from "@/lib/analytics";

import { contentPath } from "@/lib/slug";
import { ArticleJsonLd } from "./ArticleJsonLd";
import type { getArticleBySlug } from "@/lib/queries";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type PublishedArticle = NonNullable<Awaited<ReturnType<typeof getArticleBySlug>>>;

/** 公開記事の表示。サイト直下の /{slug}/ から呼ばれる(現行WordPressのURLと同じ形)。 */
export async function ArticleView({ article }: { article: PublishedArticle }) {

  // 管理者自身の閲覧、bot/クローラー、短時間の重複アクセスはカウントしない
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    const { isBot, visitorHash } = await getViewRequestContext();
    if (!isBot) {
      after(() => recordArticleView(article.id, visitorHash));
    }
  }

  const toc = extractHeadings(article.contentMarkdown);
  // 互いに依存しない問い合わせは同時に走らせる(順番に待つと、DBまでの往復の遅延が積み重なる)
  const [related, { prev, next }, shortcodes] = await Promise.all([
    getRelatedArticles(article, 4),
    getAdjacentArticles(article),
    getShortcodes(),
  ]);
  const relatedViewStatsMap = await getAdminViewStatsForArticles(related);
  const articleUrl = `${siteUrl}${contentPath(article.slug)}`;

  return (
    <Container className="py-10">
      <ArticleJsonLd article={article} url={articleUrl} siteUrl={siteUrl} />
      <nav className="flex flex-wrap items-center gap-1 text-xs text-foreground-muted" aria-label="パンくずリスト">
        <Link href="/" className="hover:text-accent-dark">
          ホーム
        </Link>
        <span>/</span>
        <Link href={`/category/${article.category.slug}`} className="hover:text-accent-dark">
          {article.category.name}
        </Link>
        <span>/</span>
        <span className="line-clamp-1 text-foreground">{article.title}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
        <article>
          <header>
            <Link
              href={`/category/${article.category.slug}`}
              className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-contrast"
            >
              {article.category.name}
            </Link>
            <h1 className="mt-3 font-display text-2xl font-black leading-tight sm:text-3xl">{article.title}</h1>
            <p className="mt-3 text-sm text-foreground-muted">公開日: {formatDate(article.publishedAt)}</p>
          </header>

          <div className="relative mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-surface-muted">
            {article.coverImageUrl ? (
              <Image src={article.coverImageUrl} alt={article.title} fill className="object-cover" priority />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <IconMug className="h-12 w-12 text-accent/50" />
              </div>
            )}
          </div>

          {toc.length > 0 && (
            <div className="mt-8">
              <TableOfContents items={toc} />
            </div>
          )}

          <div className="mt-8">
            <ArticleBody markdown={article.contentMarkdown} shortcodes={shortcodes} />
          </div>

          {article.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/tag/${tag.slug}`}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-accent hover:text-accent-dark"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-8 border-t border-border pt-6">
            <ShareButtons url={articleUrl} title={article.title} />
          </div>

          <div className="mt-8 flex items-center gap-4 rounded-2xl border border-border bg-surface-muted p-5">
            {article.author.avatarUrl ? (
              <Image
                src={article.author.avatarUrl}
                alt={article.author.name}
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                <IconMug className="h-7 w-7 text-accent-dark" />
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground-muted">この記事を書いた人</p>
              <p className="font-display font-bold">{article.author.name}</p>
              <p className="mt-1 line-clamp-2 text-sm text-foreground-muted">{article.author.bio}</p>
            </div>
          </div>

          {related.length > 0 && (
            <div className="mt-12">
              <h2 className="border-b border-border pb-3 font-display text-lg font-black">関連記事</h2>
              <div className="mt-6 grid grid-cols-2 gap-4">
                {related.map((item) => (
                  <ArticleCard
                    key={item.id}
                    article={item}
                    viewStats={relatedViewStatsMap?.get(item.id) ?? null}
                  />
                ))}
              </div>
            </div>
          )}

          <ArticleAdjacentNav prev={prev} next={next} />
        </article>

        <Sidebar articleToc={toc} />
      </div>
    </Container>
  );
}
