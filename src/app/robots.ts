import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // 管理画面のパス(/admin)は載せない。載せると、管理画面があることを、誰にでも教えてしまう
      // (未ログインの訪問者には、管理画面のURLは404を返すため、検索エンジンにも載らない)。
      allow: "/",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
