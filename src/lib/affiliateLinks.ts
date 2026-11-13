// 記事本文(Markdown)から、アフィリエイトリンクだけを取り出す。
// 記事同士の内部リンクや、参考サイトへの普通のリンクは対象外。ASPの計測URL(クリック先)だけを拾う。
// サーバー・スクリプトの両方から使うため、Node固有APIやDBには依存しない。
//
// A8.net の場合、本文には次の3種類のURLが並ぶが、リンクなのは 1 だけ:
//   1. https://px.a8.net/svt/ejp?a8mat=...   クリック先(これを検出する)
//   2. https://wwwNN.a8.net/svt/bgt?...      バナー画像(1のリンクの中に入る画像)
//   3. https://wwwNN.a8.net/0.gif?a8mat=...  計測用の1x1ピクセル(表示されない)

import { findMyLinkBoxes } from "./myLinkBox";

/** text: 文字リンク / banner: 画像リンク / widget: ASPのスクリプトが描画する商品リンク(バリューコマースのMyLinkBox) */
export type AffiliateKind = "text" | "banner" | "widget";

export interface AspRule {
  asp: string;
  label: string;
  /** そのURLがこのASPのアフィリエイトリンクか */
  match(url: URL): boolean;
  /**
   * 「同じサービス」とみなす単位の識別子。A8は a8mat の2番目の区間がプログラム単位で、同じサービスの
   * 文字リンク・バナー・別素材が同じ値になる。分からないASPはドメイン単位にする。
   */
  programKey(url: URL): string;
}

function a8matSegments(url: URL): string[] {
  // URLSearchParams は「+」を空白に読み替えるため、a8mat の区切りの「+」は生の文字列から取る
  const raw = /[?&]a8mat=([^&#]+)/i.exec(url.search)?.[1] ?? "";
  return decodeURIComponent(raw).split(/[+\s]/).filter(Boolean);
}

export const ASP_RULES: AspRule[] = [
  {
    asp: "a8",
    label: "A8.net",
    match: (url) => url.hostname === "px.a8.net",
    programKey: (url) => `a8:${a8matSegments(url)[1] ?? "unknown"}`,
  },
  {
    asp: "moshimo",
    label: "もしもアフィリエイト",
    match: (url) => url.hostname === "af.moshimo.com",
    programKey: (url) => `moshimo:${url.searchParams.get("p_id") ?? url.hostname}`,
  },
  {
    asp: "valuecommerce",
    label: "バリューコマース",
    match: (url) => url.hostname.startsWith("ck.") && url.hostname.endsWith(".valuecommerce.com"),
    programKey: (url) => `valuecommerce:${url.searchParams.get("vc_url") ?? url.hostname}`,
  },
  {
    asp: "afb",
    label: "afb",
    match: (url) => url.hostname === "t.afi-b.com",
    programKey: (url) => `afb:${url.searchParams.get("a_id") ?? url.hostname}`,
  },
  {
    asp: "accesstrade",
    label: "アクセストレード",
    match: (url) => url.hostname === "h.accesstrade.net",
    programKey: (url) => `accesstrade:${url.hostname}`,
  },
  {
    asp: "rakuten",
    label: "楽天アフィリエイト",
    match: (url) => url.hostname === "hb.afl.rakuten.co.jp" || url.hostname === "afl.rakuten.co.jp",
    programKey: (url) => `rakuten:${url.hostname}`,
  },
  {
    asp: "amazon",
    label: "Amazonアソシエイト",
    match: (url) => /(^|\.)amazon\.(co\.jp|com)$/.test(url.hostname) && url.searchParams.has("tag"),
    programKey: () => "amazon:amazon",
  },
  {
    // リクナビNEXTの求人ページへ、アフィリエイト用のパラメータ(vos=af...)を付けて直接リンクするもの
    asp: "rikunabi",
    label: "リクナビ(提携パラメータ付き)",
    match: (url) => url.hostname === "next.rikunabi.com" && (url.searchParams.get("vos") ?? "").startsWith("af"),
    programKey: () => "rikunabi:next",
  },
];

export function aspLabel(asp: string): string {
  return ASP_RULES.find((rule) => rule.asp === asp)?.label ?? asp;
}

export interface ExtractedAffiliateLink {
  url: string;
  asp: string;
  programKey: string;
  kind: AffiliateKind;
  /** 文字リンクの表示テキスト。バナーなら画像のalt。ウィジェットなら直前の見出し(どの商品の紹介か分かるように)。文字リンクで空なら読者には見えないリンク */
  anchorText: string;
  imageUrl: string | null;
  /** 本文中に同じリンクが何回出てくるか */
  occurrences: number;
  /** サービスを新しく作るときの名前。アンカーテキストから決められない種類(ウィジェット)だけ持つ */
  suggestedName?: string;
}

export const MYLINKBOX_PROGRAM_KEY = "valuecommerce:mylinkbox";
const MYLINKBOX_PROGRAM_NAME = "バリューコマース MyLinkBox(商品リンク)";

/** 位置より前で、いちばん近いMarkdown見出しの文字列。 */
function nearestHeadingBefore(markdown: string, index: number): string {
  const headings = [...markdown.slice(0, index).matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)];
  return cleanAnchor(headings.at(-1)?.[1] ?? "");
}

/** [vc-mylinkbox id="..."] を「ウィジェット」型のリンクとして取り出す。URLを持たないので、IDを疑似URLにする。 */
function extractMyLinkBoxes(markdown: string): ExtractedAffiliateLink[] {
  return findMyLinkBoxes(markdown).map(({ id, index }) => ({
    url: `vc-mylinkbox:${id}`,
    asp: "valuecommerce",
    programKey: MYLINKBOX_PROGRAM_KEY,
    kind: "widget" as const,
    anchorText: nearestHeadingBefore(markdown, index),
    imageUrl: null,
    occurrences: 1,
    suggestedName: MYLINKBOX_PROGRAM_NAME,
  }));
}

function classify(rawUrl: string): { url: string; asp: string; programKey: string } | null {
  const url = rawUrl.trim().replace(/&amp;/g, "&").replace(/[.,;:!?]+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const rule = ASP_RULES.find((r) => r.match(parsed));
  return rule ? { url, asp: rule.asp, programKey: rule.programKey(parsed) } : null;
}

// [表示テキスト](URL) 。表示テキストには、バナーの画像 ![alt](src) が入れ子になっていてよい。
// 直前が「!」のもの(画像そのもの)は、リンクではないので拾わない。
const MARKDOWN_LINK = /(?<!!)\[((?:[^\[\]\\]|\\.|!\[(?:[^\]\\]|\\.)*\]\([^)]*\))*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const MARKDOWN_IMAGE = /!\[((?:[^\]\\]|\\.)*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?[^)]*\)/;
// 本文に生のHTMLで書かれているリンク(WordPressからの移行物など)
const HTML_LINK = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const HTML_IMAGE = /<img\b[^>]*>/i;
// 日本語の句読点などを巻き込まないよう、URLに使える ASCII の文字だけにする
const BARE_URL = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/g;

function readHtmlAttribute(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return (match?.[1] ?? match?.[2] ?? "").replace(/&amp;/g, "&").trim();
}

function cleanAnchor(text: string): string {
  return text
    .replace(/\\([\[\]\\_*])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

interface RawLink {
  url: string;
  anchorText: string;
  imageUrl: string | null;
  alt: string;
}

/**
 * 本文から、アフィリエイトのクリック先URLを持つリンクを取り出す(同じリンクは回数にまとめる)。
 * Markdownのリンク → HTMLのリンク → 裸のURL の順に拾い、拾った範囲は次の段階では見ない。
 */
export function extractAffiliateLinks(markdown: string): ExtractedAffiliateLink[] {
  const raw: RawLink[] = [];
  let rest = markdown;
  const consume = (match: RegExpMatchArray, link: RawLink | null) => {
    if (link) raw.push(link);
    return " ".repeat(match[0].length);
  };

  rest = rest.replace(MARKDOWN_LINK, (...args) => {
    const match = args as unknown as RegExpMatchArray;
    const [, label, href] = match;
    const image = MARKDOWN_IMAGE.exec(label);
    const anchorText = cleanAnchor(label.replace(new RegExp(MARKDOWN_IMAGE, "g"), ""));
    return consume(match, {
      url: href,
      anchorText,
      imageUrl: image?.[2] ?? null,
      alt: cleanAnchor(image?.[1] ?? ""),
    });
  });

  rest = rest.replace(HTML_LINK, (...args) => {
    const match = args as unknown as RegExpMatchArray;
    const [, , href, inner] = match;
    const imgTag = HTML_IMAGE.exec(inner)?.[0];
    return consume(match, {
      url: href,
      anchorText: cleanAnchor(inner.replace(/<[^>]*>/g, "")),
      imageUrl: imgTag ? readHtmlAttribute(imgTag, "src") || null : null,
      alt: imgTag ? cleanAnchor(readHtmlAttribute(imgTag, "alt")) : "",
    });
  });

  // 画像の src は(計測ピクセルなど)リンクではないので、裸のURLとして拾わない
  rest = rest.replace(new RegExp(MARKDOWN_IMAGE, "g"), (image) => " ".repeat(image.length));

  for (const url of rest.match(BARE_URL) ?? []) {
    raw.push({ url, anchorText: "", imageUrl: null, alt: "" });
  }

  const merged = new Map<string, ExtractedAffiliateLink>();
  for (const widget of extractMyLinkBoxes(markdown)) {
    const key = `${widget.kind}\n${widget.url}`;
    const existing = merged.get(key);
    if (existing) existing.occurrences++;
    else merged.set(key, widget);
  }
  for (const link of raw) {
    const classified = classify(link.url);
    if (!classified) continue;

    const kind: AffiliateKind = link.imageUrl ? "banner" : "text";
    const anchorText = kind === "banner" ? link.alt || link.anchorText : link.anchorText;
    const key = `${kind}\n${classified.url}`;
    const existing = merged.get(key);
    if (existing) {
      existing.occurrences++;
      if (!existing.anchorText && anchorText) existing.anchorText = anchorText;
    } else {
      merged.set(key, { ...classified, kind, anchorText, imageUrl: link.imageUrl, occurrences: 1 });
    }
  }
  return [...merged.values()];
}

/**
 * 新しく見つかったサービスの仮の名前。アンカーテキストの【】や「」の中身がサービス名のことが多いので、それを使う。
 * 「【完全無料】…【キャリナビ】」のように訴求の文言が前に付くことが多いため、最後の括弧を採用する。
 * 管理画面で付け替えられるので、完璧でなくてよい。
 */
export function suggestProgramName(anchorTexts: string[], asp: string, programKey: string): string {
  for (const text of anchorTexts) {
    const bracketed = [...text.matchAll(/【([^】]+)】|「([^」]+)」/g)].at(-1);
    const name = bracketed?.[1] ?? bracketed?.[2];
    if (name) return name.trim().slice(0, 60);
  }
  const plain = anchorTexts.find((text) => text.length > 0);
  if (plain) return plain.slice(0, 40);
  return `${aspLabel(asp)} ${programKey.split(":")[1] ?? ""}`.trim();
}
