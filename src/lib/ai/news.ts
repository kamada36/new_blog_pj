import "server-only";

// Google ニュースの検索RSS(APIキー不要)から、キーワードに関する直近7日のニュースを取得する。
// reference-tools/blog2 の gemini.ts の searchTopics を移植したもの。

export interface NewsItem {
  title: string;
  /** 「媒体名 / 公開日時」 */
  summary: string;
  detail: string;
  link: string;
}

const MAX_ITEMS = 40;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function getTagValue(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1].trim()) : "";
}

function getSource(item: string): string {
  const match = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
  return match ? decodeEntities(match[1].trim()) : "Google News";
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchNews(keywords: string[]): Promise<NewsItem[]> {
  const query = keywords.length > 1 ? keywords.join(" OR ") : keywords[0] || "";
  if (!query.trim()) return [];

  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", `${query} when:7d`);
  url.searchParams.set("hl", "ja");
  url.searchParams.set("gl", "JP");
  url.searchParams.set("ceid", "JP:ja");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Googleニュースの取得に失敗しました(HTTP ${response.status})`);
  }

  const xml = await response.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return items
    .map((item) => {
      const title = getTagValue(item, "title").replace(/\s-\s[^-]+$/, "");
      const description = stripHtml(getTagValue(item, "description"));
      const summary = `${getSource(item)} / ${getTagValue(item, "pubDate")}`;
      const detail = description
        ? description.length > 220
          ? `${description.slice(0, 220)}...`
          : description
        : `${title}に関する最新動向です。背景と今後の影響を含めて整理してください。`;
      return { title, summary, detail, link: getTagValue(item, "link") };
    })
    .filter((item) => item.title)
    .slice(0, MAX_ITEMS);
}
