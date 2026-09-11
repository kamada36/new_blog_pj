import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { after } from "next/server";
import { Container } from "@/components/layout/Container";
import { Sidebar } from "@/components/layout/Sidebar";
import { ArticleBody } from "@/components/article/ArticleBody";
import { TableOfContents } from "@/components/article/TableOfContents";
import { ShareButtons } from "@/components/article/ShareButtons";
import { ArticleCard } from "@/components/article/ArticleCard";
import { IconMug } from "@/components/icons/CafeIcons";
import { formatDate } from "@/lib/format";
import { extractHeadings } from "@/lib/toc";
import { getArticleBySlug, getRelatedArticles, incrementArticleViewCount } from "@/lib/queries";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({ params }: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(decodeURIComponent(slug));
  if (!article || article.status !== "published") return {};

  const title = article.metaTitle || article.title;
  const description = article.metaDescription || article.excerpt;

  return {
    title,
    description,
    keywords: article.metaKeywords || undefined,
    alternates: { canonical: `${siteUrl}/articles/${article.slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: PageProps<"/articles/[slug]">) {
  const { slug } = await params;
  const article = await getArticleBySlug(decodeURIComponent(slug));
  if (!article || article.status !== "published") notFound();

  after(() => incrementArticleViewCount(article.id));

  const toc = extractHeadings(article.contentMarkdown);
  const related = await getRelatedArticles(article, 4);
  const articleUrl = `${siteUrl}/articles/${article.slug}`;

  return (
    <Container className="py-10">
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
            <ArticleBody markdown={article.contentMarkdown} />
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
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {related.map((item) => (
                  <ArticleCard key={item.id} article={item} />
                ))}
              </div>
            </div>
          )}
        </article>

        <Sidebar />
      </div>
    </Container>
  );
}
