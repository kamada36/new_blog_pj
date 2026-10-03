import { encodeSlug } from "@/lib/slug";

const SITE_NAME = "レジリエンサーCafe";

/**
 * 検索エンジン向けの構造化データ(JSON-LD)。記事(Article)とパンくず(BreadcrumbList)。
 * 現行のWordPressサイトも構造化データを出力しているため、移行で失わないように出力する。
 */
export function ArticleJsonLd({
  article,
  url,
  siteUrl,
}: {
  article: {
    title: string;
    metaTitle: string;
    metaDescription: string;
    excerpt: string;
    coverImageUrl: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
    category: { name: string; slug: string };
    author: { name: string };
  };
  url: string;
  siteUrl: string;
}) {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      headline: article.metaTitle || article.title,
      description: article.metaDescription || article.excerpt,
      ...(article.coverImageUrl ? { image: [article.coverImageUrl] } : {}),
      ...(article.publishedAt ? { datePublished: article.publishedAt.toISOString() } : {}),
      dateModified: article.updatedAt.toISOString(),
      author: { "@type": "Person", name: article.author.name },
      publisher: { "@type": "Organization", name: SITE_NAME, url: siteUrl },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: `${siteUrl}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: article.category.name,
          item: `${siteUrl}/category/${encodeSlug(article.category.slug)}/`,
        },
        { "@type": "ListItem", position: 3, name: article.title, item: url },
      ],
    },
  ];

  return (
    <script
      type="application/ld+json"
      // "<" をエスケープして、本文由来の文字列が </script> でタグを閉じてしまうのを防ぐ
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
