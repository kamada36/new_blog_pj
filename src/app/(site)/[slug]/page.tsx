import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleView } from "@/components/article/ArticleView";
import { StaticPageView } from "@/components/page/StaticPageView";
import { getArticleBySlug, getPageBySlug, getShortcodes } from "@/lib/queries";
import { contentPath, decodeSlug } from "@/lib/slug";
import { loadImageSizes } from "@/lib/imageSize";

// 記事も固定ページも、サイト直下の /{slug}/ で表示する(現行WordPressのURLと同じ形のまま移行して、
// 検索順位の引き継ぎを転送(リダイレクト)に頼らないため)。公開記事を先に探し、無ければ固定ページを探す。
// 両者のスラッグが重ならないよう、作成・更新の経路で重複と予約パスを弾いている(lib/slug.ts)。

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// 記事・固定ページは、最初にアクセスされたときに生成してキャッシュする(ISR)。ビルド時には、DBを読まない。
// (空の配列を返すと、ビルド時には1件も生成せず、初回アクセス時に生成される)
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const slug = decodeSlug((await params).slug);

  const article = await getArticleBySlug(slug);
  if (article && article.status === "published") {
    const title = article.metaTitle || article.title;
    const description = article.metaDescription || article.excerpt;
    return {
      title,
      description,
      keywords: article.metaKeywords || undefined,
      alternates: { canonical: `${siteUrl}${contentPath(article.slug)}` },
      openGraph: {
        title,
        description,
        type: "article",
        url: `${siteUrl}${contentPath(article.slug)}`,
        images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
      },
    };
  }

  const page = await getPageBySlug(slug);
  if (!page) return {};
  return {
    title: page.metaTitle || page.title,
    description: page.metaDescription,
    alternates: { canonical: `${siteUrl}${contentPath(page.slug)}` },
  };
}

export default async function SlugPage({ params }: PageProps<"/[slug]">) {
  const slug = decodeSlug((await params).slug);

  const article = await getArticleBySlug(slug);
  if (article && article.status === "published") return <ArticleView article={article} />;

  const [page, shortcodes] = await Promise.all([getPageBySlug(slug), getShortcodes()]);
  if (!page) notFound();
  const imageSizes = await loadImageSizes(page.contentMarkdown);
  return <StaticPageView title={page.title} markdown={page.contentMarkdown} shortcodes={shortcodes} imageSizes={imageSizes} />;
}
