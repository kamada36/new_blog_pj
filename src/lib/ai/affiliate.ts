// アフィリエイトリンクは「表示テキストを変えてはいけない」「バナー画像のサイズ・タグを変えてはいけない」
// という制約があるASPが多い。そのためAIにはURL・アンカーテキスト・バナーコードを一切見せず、
// 本文中に置きたい位置へ目印文字列(プレースホルダー)を置かせるだけにする。
// 実際のリンクは、生成後にプログラム側で目印文字列をまるごと置換して差し込む。
//
// 元ツール(WordPress版)は <a> タグやバナーHTMLをそのまま差し込んでいたが、このブログの本文は
// Markdownとして描画され、生HTMLは表示されない。そのため
//   - テキストリンク → [アンカーテキスト](URL)
//   - バナーリンク   → ASPのバナーコードから <a href> と <img src> を取り出し [![alt](画像URL)](リンクURL)
// に変換して差し込む。JavaScriptタグ型(<script>)のバナーは本文に埋め込めないため非対応。
// サーバー・クライアント(入力チェック)の両方から使うため、Node固有APIには依存しない。

export interface TextLinkInput {
  url: string;
  anchorText: string;
  /** スクレイピングで得た商品・サービス情報(構成案の調査材料) */
  info?: string;
}

export interface BannerLinkInput {
  /** ASPからコピーしたバナーのHTML */
  html: string;
  /** 商品名・概要(挿入位置の判断材料。記事には表示されない) */
  note?: string;
}

export const MAX_LINKS_PER_TYPE = 5;

const TEXT_PREFIX = "@@AFFILIATE_TEXT_";
const BANNER_PREFIX = "@@AFFILIATE_BANNER_";
const SUFFIX = "@@";

export function textLinkPlaceholder(index: number): string {
  return `${TEXT_PREFIX}${index}${SUFFIX}`;
}

export function bannerLinkPlaceholder(index: number): string {
  return `${BANNER_PREFIX}${index}${SUFFIX}`;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\s+/g, " ").trim();
}

function escapeMarkdownUrl(value: string): string {
  return value.trim().replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export function buildTextLinkMarkdown(link: TextLinkInput): string {
  return `[${escapeMarkdownLinkText(link.anchorText || link.url)}](${escapeMarkdownUrl(link.url)})`;
}

export interface ParsedBanner {
  href: string;
  imageSrc: string;
  alt: string;
  /** 1x1の計測用ピクセル画像(ASPのインプレッション計測用)。あれば本文にも残す */
  pixelSrcs: string[];
}

function readAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return (match?.[1] ?? match?.[2] ?? "").replace(/&amp;/g, "&").trim();
}

/** ASPのバナーコード(<a><img></a> 形式)から、Markdownへ変換するための要素を取り出す。 */
export function parseBannerHtml(html: string): ParsedBanner | null {
  if (/<script\b/i.test(html)) return null;

  const anchorMatch = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/i);
  if (!anchorMatch) return null;
  const href = readAttribute(anchorMatch[0].match(/<a\b[^>]*>/i)![0], "href");
  const bannerImgTag = anchorMatch[0].match(/<img\b[^>]*>/i)?.[0];
  if (!href || !bannerImgTag) return null;
  const imageSrc = readAttribute(bannerImgTag, "src");
  if (!/^https?:\/\//i.test(href) || !/^https?:\/\//i.test(imageSrc)) return null;

  const rest = html.replace(anchorMatch[0], "");
  const pixelSrcs = (rest.match(/<img\b[^>]*>/gi) ?? [])
    .map((tag) => readAttribute(tag, "src"))
    .filter((src) => /^https?:\/\//i.test(src));

  return { href, imageSrc, alt: readAttribute(bannerImgTag, "alt"), pixelSrcs };
}

/** 入力チェック用: 本文へ埋め込めない形式のバナーコードなら、その理由を返す。 */
export function validateBannerHtml(html: string): string | null {
  if (!html.trim()) return null;
  if (/<script\b/i.test(html)) {
    return "JavaScriptタグ型のバナーは本文(Markdown)に埋め込めません。画像リンク型(<a><img></a>)のコードを使ってください。";
  }
  return parseBannerHtml(html) ? null : "バナーコードから <a href> と <img src> を読み取れませんでした。";
}

export function buildBannerMarkdown(link: BannerLinkInput): string | null {
  const parsed = parseBannerHtml(link.html);
  if (!parsed) return null;
  const alt = escapeMarkdownLinkText(parsed.alt);
  const banner = `[![${alt}](${escapeMarkdownUrl(parsed.imageSrc)})](${escapeMarkdownUrl(parsed.href)})`;
  const pixels = parsed.pixelSrcs.map((src) => `![](${escapeMarkdownUrl(src)})`).join("");
  return `${banner}${pixels}`;
}

/** AIが出力した目印文字列を、実際のMarkdownのリンク/バナーへ機械的に差し戻す。 */
export function restoreAffiliateLinks(
  text: string,
  textLinks: TextLinkInput[] = [],
  bannerLinks: BannerLinkInput[] = []
): string {
  let result = text;

  textLinks.forEach((link, i) => {
    if (!link.url) return;
    result = result.replaceAll(textLinkPlaceholder(i), buildTextLinkMarkdown(link));
  });

  bannerLinks.forEach((link, i) => {
    const markdown = link.html ? buildBannerMarkdown(link) : null;
    if (markdown) result = result.replaceAll(bannerLinkPlaceholder(i), markdown);
  });

  return result;
}

/**
 * restoreAffiliateLinksの逆操作。「追加指示」で既存の本文をAIに読ませる際、展開済みの実URLが
 * そのまま渡るとAIが書き写す過程で改変できてしまうため、渡す前に目印文字列へ戻す。
 */
export function maskAffiliateLinks(
  text: string,
  textLinks: TextLinkInput[] = [],
  bannerLinks: BannerLinkInput[] = []
): string {
  let result = text;

  textLinks.forEach((link, i) => {
    if (!link.url) return;
    result = result.split(buildTextLinkMarkdown(link)).join(textLinkPlaceholder(i));
  });

  bannerLinks.forEach((link, i) => {
    const markdown = link.html ? buildBannerMarkdown(link) : null;
    if (markdown) result = result.split(markdown).join(bannerLinkPlaceholder(i));
  });

  return result;
}
