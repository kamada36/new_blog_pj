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
// 日本語のパスは、実際のリクエストと同じ %xx(UTF-8)形式で書く(日本語のまま書くと一致せず404になる)。
const MEDIA_ORIGIN = "https://media.resilient-cer.com";

/**
 * 本番ドメイン(NEXT_PUBLIC_SITE_URL のホスト。wwwの有無は両方)以外から配信されるときは、検索エンジンに載せない。
 * 切り替え前の仮のデプロイ先(*.netlify.app など)が、本番と同じ内容のまま索引され、重複コンテンツとして
 * 本番の検索順位に影響するのを防ぐ。環境変数のON/OFFではなく「ホスト名の一致」で判断するため、
 * DNSを本番ドメインへ切り替えた瞬間に自動で外れる(外し忘れによる、本番が検索に出なくなる事故が起きない)。
 * NEXT_PUBLIC_SITE_URL が未設定・不正なとき(ローカル開発など)は、常にnoindexになる。
 * 注意: robots.txt で Disallow にはしない(クロールできないとnoindexが読まれないため)。
 */
function nonProductionHostPattern(): string {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname;
    const alias = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const escapeRegExp = (value: string) => value.replace(/\./g, "\\.");
    // ポート番号付き(localhost:3000 など)も含めて、本番ホスト以外のすべてに一致させる
    return `^(?!(?:${escapeRegExp(host)}|${escapeRegExp(alias)})(?::\\d+)?$).*$`;
  } catch {
    return ".*";
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
  // 現行WordPressのURLは末尾が「/」(例: /ai-era-transfer-construction/)。URLを1文字も変えないため合わせる。
  // (Next.jsの既定は「/」なしで、「/」付きを「/」なしへ転送してしまう)
  trailingSlash: true,
  async headers() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: nonProductionHostPattern() }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
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
