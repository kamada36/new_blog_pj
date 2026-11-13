// バリューコマースの「MyLinkBox」(商品リンクのウィジェット)を、記事本文に置くための記法。
//
// 旧WordPress版は <div data-vc_mylinkbox_id="123"></div> を置き、サイト共通の mylinkbox.js が商品カードに差し替えていた。
// このブログの本文(Markdown)は生HTMLを描画しないため、独立した1行のショートコードで置く:
//
//   [vc-mylinkbox id="891647020"]
//
// 描画側(ArticleBody)がこの行を <div data-vc_mylinkbox_id="..."> に変え、mylinkbox.js を読み込む。
// 本文のアフィリエイト管理(affiliateLinks.ts)も、同じ記法を「ウィジェット」型のリンクとして検出する。
// サーバー・クライアント・スクリプトのどれからも使えるよう、依存を持たない。

/** 閉じ括弧・開き括弧の `\` は、WordPress移行時のMarkdown変換でエスケープされた形を許容するためのもの */
const SOURCE = String.raw`\\?\[vc-mylinkbox\s+id\s*=\s*"(\d+)"\s*\\?\]`;

export function myLinkBoxShortcode(id: string): string {
  return `[vc-mylinkbox id="${id}"]`;
}

/** 段落の文字列が、MyLinkBoxのショートコード1つだけなら、そのIDを返す。 */
export function parseMyLinkBoxId(text: string): string | null {
  return new RegExp(`^\\s*${SOURCE}\\s*$`).exec(text)?.[1] ?? null;
}

/**
 * 本文中のショートコードを、位置とIDつきで返す。描画側(ArticleBody)が商品リンクの置き場所にするのは、
 * ショートコードだけの段落なので、文章の途中に混ざったものは数えない(表示と管理の結果を一致させる)。
 * 引用(>)の中の行も、描画側が置き場所にするので数える。
 */
export function findMyLinkBoxes(markdown: string): { id: string; index: number }[] {
  const standalone = new RegExp(`^[ \\t]*(?:>[ \\t]*)*${SOURCE}[ \\t\\r]*$`, "gm"); // 管理画面のフォームから保存した本文は改行が CRLF のことがある
  return [...markdown.matchAll(standalone)].map((match) => ({ id: match[1], index: match.index }));
}

export function hasMyLinkBox(markdown: string): boolean {
  return markdown.includes("vc-mylinkbox") && findMyLinkBoxes(markdown).length > 0;
}

/** バリューコマースが配布しているスクリプト。ページ内の [data-vc_mylinkbox_id] を商品カードに差し替える。 */
export const MYLINKBOX_SCRIPT_SRC = "https://mlb.valuecommerce.com/mylinkbox.js";
