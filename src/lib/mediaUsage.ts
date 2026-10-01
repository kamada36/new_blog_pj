import "server-only";
import { prisma } from "@/lib/prisma";

export type MediaUsageArticle = { id: string; slug: string; title: string };

const URL_PATTERN = /https?:\/\/[^\s"')\]]+/g;
// WordPressが自動生成するリサイズ版URLの末尾("-幅x高さ.拡張子")。
// メディアライブラリにはオリジナル画像のみを取り込んでいるため、記事側がリサイズ版URLを
// 直接埋め込んでいる場合でも、この接尾辞を外した元URLとして使用状況を記録する。
const SIZE_VARIANT_SUFFIX = /-\d{1,5}x\d{1,5}(\.\w+)$/i;

function normalizeToOriginalUrl(url: string): string {
  return url.replace(SIZE_VARIANT_SUFFIX, "$1");
}

function recordUsage(map: Map<string, MediaUsageArticle[]>, url: string | null | undefined, article: MediaUsageArticle) {
  if (!url) return;
  const list = map.get(url);
  if (list) {
    if (!list.some((a) => a.id === article.id)) list.push(article);
  } else {
    map.set(url, [article]);
  }

  const original = normalizeToOriginalUrl(url);
  if (original !== url) recordUsage(map, original, article);
}

/**
 * 全記事の本文・アイキャッチからURLを一度だけ抽出し、「画像URL → 使用している記事一覧」の
 * マップを作る。記事ごとにメディアを1件ずつLIKE検索するより大幅に軽い(現状: 記事150件・
 * 本文合計1.8MB程度なのでミリ秒オーダーで完了する)。
 */
export async function buildMediaUsageMap(): Promise<Map<string, MediaUsageArticle[]>> {
  const articles = await prisma.article.findMany({
    select: { id: true, slug: true, title: true, contentMarkdown: true, coverImageUrl: true },
  });

  const usage = new Map<string, MediaUsageArticle[]>();

  for (const article of articles) {
    const entry: MediaUsageArticle = { id: article.id, slug: article.slug, title: article.title };
    recordUsage(usage, article.coverImageUrl, entry);

    const matches = article.contentMarkdown.match(URL_PATTERN);
    if (matches) {
      for (const rawUrl of matches) {
        const url = rawUrl.replace(/[.,;:!?]+$/, "");
        recordUsage(usage, url, entry);
      }
    }
  }

  return usage;
}
