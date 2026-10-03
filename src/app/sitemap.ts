import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { contentPath, encodeSlug } from "@/lib/slug";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// 現行WordPressのサイトマップと同じく、末尾スラッシュ付きの正規URL(canonicalと同じ形)を載せる。
// 記事・固定ページはサイト直下の /{slug}/ 。日本語スラッグは %xx にエンコードして出力する。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, categories, pages] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({ select: { slug: true } }),
    prisma.page.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  // /profile は専用ルートがあるため、固定ページ側と二重に載せない
  const pageEntries = pages.filter((page) => page.slug !== "profile");

  return [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/profile/`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/contact/`, changeFrequency: "yearly", priority: 0.3 },
    ...pageEntries.map((page) => ({
      url: `${siteUrl}${contentPath(page.slug)}`,
      lastModified: page.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...categories.map((category) => ({
      url: `${siteUrl}/category/${encodeSlug(category.slug)}/`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...articles.map((article) => ({
      url: `${siteUrl}${contentPath(article.slug)}`,
      lastModified: article.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
