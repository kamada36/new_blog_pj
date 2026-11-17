// アフィリエイトリンクは「表示テキストを変えてはいけない」「バナー画像のサイズ・タグを変えてはいけない」
// という制約があるASPが多い。そのためAIにはURL・アンカーテキスト・バナーコードを一切見せず、
// 本文中に置きたい位置へ目印文字列(プレースホルダー)を置かせるだけにする。
// 実際のリンクは、生成後にプログラム側で目印文字列をまるごと置換して差し込む。
//
// 元ツール(WordPress版)は <a> タグやバナーHTMLをそのまま差し込んでいたが、このブログの本文は
// Markdownとして描画され、生HTMLは表示されない。そのため
//   - テキストリンク → [アンカーテキスト](URL) と、ASPの計測用ピクセル ![](ピクセルURL)
//   - バナーリンク   → ASPのバナーコードから <a href> と <img src> を取り出し [![alt](画像URL)](リンクURL) と計測ピクセル
// に変換して差し込む。JavaScriptタグ型(<script>)のバナーは本文に埋め込めないため非対応。
//
// 目印は3種類ある:
//   - セット(@@AFFILIATE_SET_n@@): 入力順が同じバナーとテキストリンクを1つにまとめたもの。展開すると、必ず
//     「バナーの段落 → その直下にテキストリンクの段落」になる。AIに2つの目印を並べさせると、片方だけ入れたり
//     離して置いたりするため、1つの目印にして、両方が必ず・隣り合って出るようにしている。
//   - テキスト(@@AFFILIATE_TEXT_n@@)・バナー(@@AFFILIATE_BANNER_n@@): セットを組まない単体のリンク。
// サーバー・クライアント(入力チェック)の両方から使うため、Node固有APIには依存しない。
import { isAffiliateUrl } from "../affiliateLinks";

export interface TextLinkInput {
  url: string;
  anchorText: string;
  /** スクレイピングで得た商品・サービス情報(構成案の調査材料) */
  info?: string;
  /** ASPのテキストリンクのコードに付いている、計測用の1x1ピクセル画像のURL。あれば本文にもリンクの直後に残す */
  pixelUrl?: string;
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
const SET_PREFIX = "@@AFFILIATE_SET_";
const SUFFIX = "@@";

export function textLinkPlaceholder(index: number): string {
  return `${TEXT_PREFIX}${index}${SUFFIX}`;
}

export function bannerLinkPlaceholder(index: number): string {
  return `${BANNER_PREFIX}${index}${SUFFIX}`;
}

export function setLinkPlaceholder(index: number): string {
  return `${SET_PREFIX}${index}${SUFFIX}`;
}

/** 入力順が同じテキストリンクとバナー(1本目同士、2本目同士…)を、セットとして組む数。 */
export function pairedLinkCount(textLinks: unknown[], bannerLinks: unknown[]): number {
  return Math.min(textLinks.length, bannerLinks.length);
}

/**
 * 本文に置く「配置の単位」ごとの目印文字列。セット1つ・単体のテキスト1本・単体のバナー1本が、それぞれ1単位。
 * pairedCount 番目より後のリンクは、セットを組まない単体として扱う。
 */
export function affiliateUnitTokens(textCount: number, bannerCount: number, pairedCount: number): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < pairedCount; i++) tokens.push(setLinkPlaceholder(i));
  for (let i = pairedCount; i < textCount; i++) tokens.push(textLinkPlaceholder(i));
  for (let i = pairedCount; i < bannerCount; i++) tokens.push(bannerLinkPlaceholder(i));
  return tokens;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\s+/g, " ").trim();
}

function escapeMarkdownUrl(value: string): string {
  return value.trim().replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export function buildTextLinkMarkdown(link: TextLinkInput): string {
  const anchor = `[${escapeMarkdownLinkText(link.anchorText || link.url)}](${escapeMarkdownUrl(link.url)})`;
  const pixel = link.pixelUrl && /^https?:\/\//i.test(link.pixelUrl) ? `![](${escapeMarkdownUrl(link.pixelUrl)})` : "";
  return `${anchor}${pixel}`;
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

export interface ParsedTextLink {
  url: string;
  anchorText: string;
  /** 計測用の1x1ピクセル画像のURL(無ければnull) */
  pixelUrl: string | null;
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * ASPのテキストリンクのコード(<a href="...">表示テキスト</a> と、その後ろの計測用 <img>)から、
 * URL・表示テキスト・ピクセルのURLを取り出す。バナー(<a>の中に画像があるもの)や、リンクを読み取れないものはnull。
 */
export function parseTextLinkHtml(html: string): ParsedTextLink | null {
  if (/<script\b/i.test(html)) return null;
  const anchorMatch = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/i);
  if (!anchorMatch) return null;
  if (/<img\b/i.test(anchorMatch[0])) return null;

  const url = readAttribute(anchorMatch[0].match(/<a\b[^>]*>/i)![0], "href");
  if (!/^https?:\/\//i.test(url)) return null;

  const inner = anchorMatch[0].replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, "");
  const anchorText = decodeBasicEntities(inner.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

  const rest = html.replace(anchorMatch[0], "");
  const pixelUrl =
    (rest.match(/<img\b[^>]*>/gi) ?? []).map((tag) => readAttribute(tag, "src")).find((src) => /^https?:\/\//i.test(src)) ?? null;

  return { url, anchorText, pixelUrl };
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

/** セット: バナーの段落と、その直下のテキストリンクの段落。どちらかが作れない場合は、作れる方だけ。 */
export function buildSetMarkdown(text: TextLinkInput | undefined, banner: BannerLinkInput | undefined): string | null {
  const bannerMarkdown = banner?.html ? buildBannerMarkdown(banner) : null;
  const textMarkdown = text?.url ? buildTextLinkMarkdown(text) : null;
  const parts = [bannerMarkdown, textMarkdown].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * AIが出力した目印文字列を、実際のMarkdownのリンク/バナーへ機械的に差し戻す。
 * pairedCount はセットを組む数(省略時は、テキストリンクとバナーの少ない方)。
 * 置換文字列は関数で渡す(URLに含まれる $ が、置換の特殊記法として解釈されるのを避ける)。
 */
export function restoreAffiliateLinks(
  text: string,
  textLinks: TextLinkInput[] = [],
  bannerLinks: BannerLinkInput[] = [],
  pairedCount: number = pairedLinkCount(textLinks, bannerLinks)
): string {
  let result = text;

  for (let i = 0; i < pairedCount; i++) {
    const markdown = buildSetMarkdown(textLinks[i], bannerLinks[i]);
    if (markdown) result = result.replaceAll(setLinkPlaceholder(i), () => markdown);
  }

  textLinks.forEach((link, i) => {
    if (!link.url) return;
    const markdown = buildTextLinkMarkdown(link);
    result = result.replaceAll(textLinkPlaceholder(i), () => markdown);
  });

  bannerLinks.forEach((link, i) => {
    const markdown = link.html ? buildBannerMarkdown(link) : null;
    if (markdown) result = result.replaceAll(bannerLinkPlaceholder(i), () => markdown);
  });

  return result;
}

/**
 * restoreAffiliateLinksの逆操作。「追加指示」で既存の本文をAIに読ませる際、展開済みの実URLが
 * そのまま渡るとAIが書き写す過程で改変できてしまうため、渡す前に目印文字列へ戻す。
 * セット(バナー+テキストが隣り合う形)を先に戻し、残った単独のものを個別の目印に戻す。
 */
export function maskAffiliateLinks(
  text: string,
  textLinks: TextLinkInput[] = [],
  bannerLinks: BannerLinkInput[] = [],
  pairedCount: number = pairedLinkCount(textLinks, bannerLinks)
): string {
  let result = text;

  for (let i = 0; i < pairedCount; i++) {
    const markdown = buildSetMarkdown(textLinks[i], bannerLinks[i]);
    if (markdown) result = result.split(markdown).join(setLinkPlaceholder(i));
  }

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

// ─── 指示文(追加指示・リライトの指示)に貼られたASPのコードを、目印へ置き換える ───────────────────

// <a ...>...</a> と、その直後に続く計測用の <img>(間の空白・改行は許容)。ASPが発行するコードの1かたまり。
const ASP_CODE_BLOCK = /<a\b[^>]*>[\s\S]*?<\/a>(?:\s*<img\b[^>]*>)*/gi;

export interface ExtractedAffiliateCode {
  /** ASPのコードを目印文字列に置き換えた指示文 */
  text: string;
  textLinks: TextLinkInput[];
  bannerLinks: BannerLinkInput[];
}

/**
 * 指示文の中にASPのアフィリエイトコード(A8などの <a href=計測URL>…</a> と計測用 <img>)が貼られていたら、
 * AIに見せる前に取り出して目印文字列に置き換える。
 *
 * AIにコードをそのまま見せると、AIはそれをMarkdownに書き写す過程で、URLや表示テキストを改変したり、
 * Markdownにできない <img> を生のHTMLのまま本文に残したりする(このブログは生HTMLを描画せず、文字としてそのまま表示される)。
 * 目印にしておけば、AIは位置を決めるだけで、実際のリンクは生成後にプログラムが元のまま差し込む。
 * 目印の番号は、textStart / bannerStart から振る(フォームで指定済みのリンクの続き番号にするため)。
 * ASPの計測URLでない普通のリンク(<a href="https://example.com/">)は対象外で、そのまま残す。
 */
export function extractAffiliateCode(text: string, textStart = 0, bannerStart = 0): ExtractedAffiliateCode {
  const textLinks: TextLinkInput[] = [];
  const bannerLinks: BannerLinkInput[] = [];

  const replaced = text.replace(ASP_CODE_BLOCK, (block) => {
    const href = readAttribute(block.match(/<a\b[^>]*>/i)![0], "href");
    if (!isAffiliateUrl(href)) return block;

    if (/<img\b/i.test(block.match(/<a\b[^>]*>[\s\S]*?<\/a>/i)![0])) {
      if (!parseBannerHtml(block)) return block;
      bannerLinks.push({ html: block });
      return bannerLinkPlaceholder(bannerStart + bannerLinks.length - 1);
    }

    const parsed = parseTextLinkHtml(block);
    if (!parsed) return block;
    textLinks.push({ url: parsed.url, anchorText: parsed.anchorText, pixelUrl: parsed.pixelUrl ?? undefined });
    return textLinkPlaceholder(textStart + textLinks.length - 1);
  });

  return { text: replaced, textLinks, bannerLinks };
}
