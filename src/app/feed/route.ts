import { prisma } from "@/lib/prisma";
import { contentPath } from "@/lib/slug";

// 現行WordPressの RSSフィード(https://resilient-cer.com/feed/)と同じURLで、最新記事のRSS 2.0を配信する。
// フィードリーダー・アグリゲーターの購読が、移行で切れないようにするためのもの。
export const revalidate = 3600;

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SITE_NAME = "レジリエンサーCafe";
const SITE_DESCRIPTION = "この一杯から始まる、IT転職への道しるべ。未経験からのIT転職・キャリアの考え方を発信するブログです。";
const LATEST_COUNT = 20;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: LATEST_COUNT,
    select: {
      title: true,
      slug: true,
      excerpt: true,
      metaDescription: true,
      publishedAt: true,
      updatedAt: true,
      category: { select: { name: true } },
    },
  });

  const items = articles
    .map((article) => {
      const link = `${siteUrl}${contentPath(article.slug)}`;
      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${(article.publishedAt ?? article.updatedAt).toUTCString()}</pubDate>
      <category>${escapeXml(article.category.name)}</category>
      <description>${escapeXml(article.metaDescription || article.excerpt)}</description>
    </item>`;
    })
    .join("\n");

  const lastBuild = (articles[0]?.updatedAt ?? new Date()).toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${siteUrl}/</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>ja</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${siteUrl}/feed/" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
