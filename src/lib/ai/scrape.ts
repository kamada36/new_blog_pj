import "server-only";

// アフィリエイトのリンク先ページの内容を取得し、構成案の調査材料にする。
// reference-tools/blog2 の /api/scrape を移植したもの。管理者が入力したURLをサーバーから取得するため、
// 社内ネットワーク等への到達(SSRF)を防ぐ最低限のチェックを加えている。

const MAX_CONTENT_LENGTH = 2000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/** http(s)で、ローカル・プライベートアドレスではないURLだけを許可する。 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("URLの形式が正しくありません。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http/https のURLだけが指定できます。");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    PRIVATE_IPV4.some((pattern) => pattern.test(host)) ||
    host === "::1" ||
    host === "::" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host);
  if (isPrivate) throw new Error("ローカル・社内ネットワークのURLは指定できません。");
  return url;
}

async function fetchWithCheckedRedirects(startUrl: URL, signal: AbortSignal): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en-US;q=0.9",
      },
      redirect: "manual",
      signal,
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    return res;
  }
  throw new Error("リダイレクトが多すぎます。");
}

export interface ScrapeResult {
  info: string;
  failed: boolean;
}

export async function scrapeUrl(rawUrl: string): Promise<ScrapeResult> {
  const url = assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetchWithCheckedRedirects(url, controller.signal);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1].trim() ?? "";
    const description = (
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
    )?.[1].trim();

    const bodyText = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const info = [
      title ? `タイトル: ${title}` : "",
      description ? `説明: ${description}` : "",
      bodyText ? `本文抜粋: ${bodyText.slice(0, MAX_CONTENT_LENGTH)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { info: info || `URL: ${rawUrl} のコンテンツを取得しました(詳細不明)`, failed: false };
  } catch (error) {
    console.warn("[scrape] 取得に失敗:", error);
    return {
      info: `アフィリエイトURL: ${rawUrl}\n(コンテンツ取得に失敗しました。AIがURLから内容を推測します)`,
      failed: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
