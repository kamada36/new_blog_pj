import "server-only";
import probe from "probe-image-size";
import { BALLOON_ICON_ALT_PREFIX } from "@/lib/shortcodes";

// 記事本文の画像を、next/image(WebP・画面幅に合わせた小サイズ)で配信するための、画像サイズの取得。
//
// 本文の画像は、Markdown の ![](URL) で書かれていて、サイズの情報がない。サイズが分からないまま変換すると、
// 小さい画像が引き伸ばされたり、読み込み時にレイアウトがずれたりするため、ページの生成時に、画像のサイズを
// (ファイルの先頭の一部だけを読んで)調べる。ページはキャッシュされるので、調べるのは、ページを再生成するときだけ。
// 調べられない画像(外部サイトの画像、GIF、SVG、取得失敗)は、従来どおり、そのまま表示する。

export type ImageSize = { width: number; height: number };

const PROBE_TIMEOUT_MS = 4000;
const CONCURRENCY = 8;
const MAX_IMAGES_PER_PAGE = 60;
const FAILURE_RETRY_MS = 10 * 60 * 1000;

// 同じサーバー(関数の実行環境)が生きている間は、調べた結果を使い回す
const sizeCache = new Map<string, ImageSize>();
const failedAt = new Map<string, number>();

/** next.config.ts の images.remotePatterns と同じ、最適化を通してよいホスト。 */
function optimizableHosts(): Set<string> {
  const hosts = new Set(["media.resilient-cer.com"]);
  try {
    if (process.env.R2_PUBLIC_URL) hosts.add(new URL(process.env.R2_PUBLIC_URL).host);
  } catch {
    // 不正なURLは無視する
  }
  return hosts;
}

function imageUrls(markdown: string): string[] {
  const hosts = optimizableHosts();
  const urls = new Set<string>();
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    const [, alt, url] = match;
    if (alt.startsWith(BALLOON_ICON_ALT_PREFIX)) continue; // 吹き出しのアイコンは、小さいので、そのまま表示する
    try {
      if (hosts.has(new URL(url).host)) urls.add(url);
    } catch {
      // 不正なURLは無視する
    }
  }
  return [...urls].slice(0, MAX_IMAGES_PER_PAGE);
}

async function probeOne(url: string): Promise<ImageSize | null> {
  const cached = sizeCache.get(url);
  if (cached) return cached;
  const failed = failedAt.get(url);
  if (failed && Date.now() - failed < FAILURE_RETRY_MS) return null;

  try {
    const result = await probe(url, { timeout: PROBE_TIMEOUT_MS });
    // アニメーションのGIFやSVGは、最適化の対象にしない(next/image は、そのまま返す、または表示できない)
    if (!["jpg", "png", "webp"].includes(result.type) || !result.width || !result.height) {
      failedAt.set(url, Date.now());
      return null;
    }
    const size = { width: result.width, height: result.height };
    sizeCache.set(url, size);
    return size;
  } catch {
    failedAt.set(url, Date.now());
    return null;
  }
}

/** Markdown の本文に出てくる、最適化できる画像のサイズを、URLごとにまとめて返す。 */
export async function loadImageSizes(markdown: string): Promise<Record<string, ImageSize>> {
  const urls = imageUrls(markdown);
  const sizes: Record<string, ImageSize> = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= urls.length) return;
        const size = await probeOne(urls[i]);
        if (size) sizes[urls[i]] = size;
      }
    })
  );
  return sizes;
}
