export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[/?#]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * 記事・固定ページはサイト直下の /{slug}/ で表示する(現行WordPressのURLと同じ形)。
 * そのため、サイト直下に既にあるパスと同名のスラッグは使えない(使うと記事ページが表示されなくなる)。
 * 記事・固定ページの作成/更新・AI生成の全経路で、この一覧を弾く。
 */
export const RESERVED_SLUGS: readonly string[] = [
  // このアプリのルート
  "admin",
  "api",
  "articles",
  "category",
  "tag",
  "search",
  "contact",
  "profile",
  "archive",
  "feed",
  "sitemap.xml",
  "robots.txt",
  "sitemap.html",
  "favicon.ico",
  "ads.txt",
  "_next",
  // 旧WordPressの管理系・システム系のパス(取り違え・転送ルールとの衝突を避ける)
  "page",
  "author",
  "comments",
  "wp-admin",
  "wp-content",
  "wp-json",
  "wp-login.php",
  "wp-includes",
  "xmlrpc.php",
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

/** パーセントエンコードを(不正な形なら元のまま)デコードする。 */
export function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

/**
 * URLに載せるスラッグ。現行WordPressのURLと同じく、日本語は小文字16進の %e3%81... 形式にする
 * (大文字・小文字は同じURLとして扱われるが、現行の表記に完全に合わせて余計な差を作らない)。
 */
export function encodeSlug(slug: string): string {
  return encodeURIComponent(decodeSlug(slug)).replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());
}

/** 記事・固定ページのサイト内パス(末尾スラッシュ付き。例: /ai-era-transfer-construction/) */
export function contentPath(slug: string): string {
  return `/${encodeSlug(slug)}/`;
}
