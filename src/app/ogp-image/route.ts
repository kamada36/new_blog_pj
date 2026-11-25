import { loadSiteOgImage } from "@/lib/ogp/siteImage";

// サイト共通のOGP画像(SNSでURLを共有したときのサムネイル)の予備の配信口。
// ふだんのOGPタグは、R2に保存した静的な画像を直接指す(lib/ogp/metadata.ts)。このURLが使われるのは、
// まだ保存されていないとき(アクセスされると作って保存する)と、以前このURLを読んだSNSが取り直すとき。
// 設定(ヒーロー画像)を読むので、ビルド時には作らず、アクセスされたときに処理する。
//
// Next.jsの標準機能(opengraph-image.tsx)を使わないのは、このサイトが trailingSlash: true で、標準のURL
// (/opengraph-image?xxxx)が、末尾に「/」を付けたURLへ転送されてしまい、SNSのクローラーが画像を取りこぼす恐れがあるため。
export const dynamic = "force-dynamic";

export async function GET() {
  const { body, stored } = await loadSiteOgImage();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      // 素材が欠けた画像などは保存されないので、CDNにも長く残さない
      "Cache-Control": stored ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" : "no-store",
    },
  });
}
