import type { NextConfig } from "next";

const remotePatterns = [new URL("https://media.resilient-cer.com/**")];

// R2の公開URL(カスタムドメイン or r2.devドメイン)。未設定でもビルドできるようガードする。
if (process.env.R2_PUBLIC_URL) {
  try {
    remotePatterns.push(new URL(`${process.env.R2_PUBLIC_URL.replace(/\/+$/, "")}/**`));
  } catch {
    // 不正なURLが設定されている場合は無視する(next/imageのエラーで気付ける)。
  }
}

// 旧サイト(WordPress)のURLから新サイトへの転送。permanent: true は 308 で出力される(検索エンジンは 301 と同様に
// 「恒久的な移転」として扱い、評価を引き継ぐ)。記事の /{slug}/ は現行と同じURLのため、ここには含めない。
// 日本語のパスは、Next.jsが %xx(UTF-8)にデコードしてから照合する。
const MEDIA_ORIGIN = "https://media.resilient-cer.com";

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
  // 現行WordPressのURLは末尾が「/」(例: /ai-era-transfer-construction/)。URLを1文字も変えないため合わせる。
  // (Next.jsの既定は「/」なしで、「/」付きを「/」なしへ転送してしまう)
  trailingSlash: true,
  async redirects() {
    return [
      // このアプリで一時期使っていた /articles/{slug} → /{slug}/
      { source: "/articles/:slug", destination: "/:slug/", permanent: true },

      // 固定ページ(URLが変わるもの)
      { source: "/contact-us", destination: "/contact/", permanent: true },
      { source: "/%E3%83%AC%E3%82%B8%E3%83%AA%E3%82%A8%E3%83%B3%E3%82%B5%E3%83%BCcafe%E3%81%A8%E3%81%AF", destination: "/about/", permanent: true }, // /レジリエンサーcafeとは/
      { source: "/%E3%83%97%E3%83%A9%E3%82%A4%E3%83%90%E3%82%B7%E3%83%BC%E3%83%9D%E3%83%AA%E3%82%B7%E3%83%BC-%E5%85%8D%E8%B2%AC%E4%BA%8B%E9%A0%85", destination: "/privacy-policy/", permanent: true }, // /プライバシーポリシー-免責事項/

      // ページ送り: /page/2/ → /?page=2
      { source: "/page/:n(\\d+)", destination: "/?page=:n", permanent: true },
      { source: "/category/:slug/page/:n(\\d+)", destination: "/category/:slug/?page=:n", permanent: true },
      { source: "/tag/:slug/page/:n(\\d+)", destination: "/tag/:slug/?page=:n", permanent: true },

      // 日付アーカイブ: /2024/06/ → /archive/2024/06/
      { source: "/:year(\\d{4})/:month(\\d{2})", destination: "/archive/:year/:month/", permanent: true },
      { source: "/:year(\\d{4})/:month(\\d{2})/page/:n(\\d+)", destination: "/archive/:year/:month/?page=:n", permanent: true },

      // HTMLサイトマップ・記事ごとのコメントフィード
      { source: "/sitemap.html", destination: "/", permanent: true },
      { source: "/:slug/feed", destination: "/:slug/", permanent: true },

      // サイト内検索: /?s=キーワード → /search/?q=キーワード
      {
        source: "/",
        has: [{ type: "query", key: "s", value: "(?<s>.+)" }],
        destination: "/search/?q=:s",
        permanent: true,
      },

      // 旧WordPressの画像URL(Google画像検索などに残っているもの) → 画像の配信ドメイン
      { source: "/wp-content/uploads/:path*", destination: `${MEDIA_ORIGIN}/:path*`, permanent: true },
    ];
  },
};

export default nextConfig;
