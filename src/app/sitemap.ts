import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, categories, pages] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({ select: { slug: true } }),
    prisma.page.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/profile`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.3 },
    ...pages.map((page) => ({
      url: `${siteUrl}/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...categories.map((category) => ({
      url: `${siteUrl}/category/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...articles.map((article) => ({
      url: `${siteUrl}/articles/${article.slug}`,
      lastModified: article.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
