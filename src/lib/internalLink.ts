// 本文のリンクが「このサイト内のページ」を指しているかの判定。サーバー・クライアントのどちらからも使える(server-only にしない)。
//
// 本文には、WordPress時代の名残などで、自サイトの記事が絶対URL(https://resilient-cer.com/slug/)で書かれていることがある。
// ブログカード表示(linkCards.ts / ArticleBody)では、これも /slug/ と同じ内部リンクとして扱う。

const SITE_HOSTS = new Set<string>(["resilient-cer.com", "www.resilient-cer.com"]);

const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (envSiteUrl) {
  try {
    SITE_HOSTS.add(new URL(envSiteUrl).host);
  } catch {
    // 環境変数がURLでなければ無視する
  }
}

/** このサイトの絶対URLなら、サイト内のパス(例: /slug/)を返す。パスがそのまま渡されたら、それを返す。それ以外はnull。 */
export function toInternalPath(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    if (!SITE_HOSTS.has(url.host)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
