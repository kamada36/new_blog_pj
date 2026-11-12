import "server-only";
import { prisma } from "@/lib/prisma";
import { decodeSlug } from "@/lib/slug";
import type { LinkCards } from "@/components/article/ArticleBody";

// 記事内リンクのブログカード表示。
//
// 本文に「リンクだけの段落」(例: 単独の行の [記事タイトル](/slug/))があり、それがこのサイトの公開記事を指すとき、
// ArticleBody がテキストリンクの代わりに、アイキャッチ画像つきのカードで表示する(WordPressのブログカードと同じ見た目)。
// 本文にはサムネイルのURLを持たせず、表示時にここで記事のタイトルと画像を引く。タイトルやアイキャッチを直せば、カードにも反映される。
// 文中のテキストリンク(同じ行に他の文字がある)は、これまで通りリンクのまま。

const MAX_CARDS_PER_PAGE = 20;

/** 行全体が [テキスト](/slug/) だけの行。キャプチャは括弧内のパス(本文のhrefそのもの)。 */
const STANDALONE_INTERNAL_LINK = /^[ \t]*\[[^\]\n]*\]\((\/[^/\s)#?]+\/?)\)[ \t]*$/gm;

/** Markdown本文の「リンクだけの行」のうち、公開記事を指すものの情報を、本文のhrefごとにまとめて返す。 */
export async function loadLinkCards(markdown: string): Promise<LinkCards> {
  const slugByHref = new Map<string, string>();
  for (const match of markdown.matchAll(STANDALONE_INTERNAL_LINK)) {
    const href = match[1];
    if (slugByHref.size >= MAX_CARDS_PER_PAGE) break;
    slugByHref.set(href, decodeSlug(href.replace(/^\/|\/$/g, "")));
  }
  if (slugByHref.size === 0) return {};

  const articles = await prisma.article.findMany({
    where: { slug: { in: [...new Set(slugByHref.values())] }, status: "published" },
    select: { slug: true, title: true, coverImageUrl: true },
  });
  const bySlug = new Map(articles.map((article) => [article.slug, article]));

  const cards: LinkCards = {};
  for (const [href, slug] of slugByHref) {
    const article = bySlug.get(slug);
    if (article) cards[href] = { title: article.title, imageUrl: article.coverImageUrl };
  }
  return cards;
}
