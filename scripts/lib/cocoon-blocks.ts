import { parse } from "node-html-parser";

/**
 * WordPress(Cocoonテーマ)の「吹き出し」ブロック(wp:cocoon-blocks/balloon-ex-box-1)を
 * このアプリの既存レンダリング機構(react-markdownのblockquote→.article-callout)で
 * そのまま表示できる形に変換する。
 *
 * Cocoon側は左右位置・アイコン形状などdiv/class構造に装飾情報を持たせているが、
 * このアプリはCocoon固有の見た目までは再現せず、「アイコン画像+発言テキストの引用ブロック」
 * という意味的に近い形へ単純化する(要件通り、移行先に不要な装飾情報は割り切って省略)。
 *
 * 本関数はHTML→Markdown変換(node-html-markdown)の前段で実行する。画像URLの
 * ドメイン置換はこの後段(rewriteMediaUrls)でまとめて行うため、ここでは元URLのまま扱う。
 */
export function transformCocoonBalloons(html: string): string {
  if (!html.includes("cocoon-block-balloon")) return html;

  const root = parse(html, { comment: false });
  const balloons = root.querySelectorAll(".cocoon-block-balloon");

  for (const balloon of balloons) {
    const iconUrl = balloon.querySelector(".speech-icon-image")?.getAttribute("src")
      ?? balloon.querySelector("img")?.getAttribute("src");
    const messageHtml = balloon.querySelector(".speech-balloon")?.innerHTML.trim() ?? "";

    if (!messageHtml && !iconUrl) {
      balloon.replaceWith("");
      continue;
    }

    const iconPart = iconUrl ? `<p><img src="${iconUrl}" alt="" /></p>` : "";
    balloon.replaceWith(`<blockquote>${iconPart}${messageHtml}</blockquote>`);
  }

  return root.toString();
}
