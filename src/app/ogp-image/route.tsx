import { ogpImageResponse } from "@/lib/ogp/render";

// サイト共通のOGP画像(SNSでURLを共有したときのサムネイル)。記事ごとのカバー画像が無いページで使われる。
// 画像の中身は lib/ogp/render.tsx。設定(ヒーロー画像)を読むので、ビルド時には作らず、アクセスされたときに生成する。
//
// Next.jsの標準機能(opengraph-image.tsx)を使わないのは、このサイトが trailingSlash: true で、標準のURL
// (/opengraph-image?xxxx)が、末尾に「/」を付けたURLへ転送されてしまい、SNSのクローラーが画像を取りこぼす恐れがあるため。
// ここでは、最初から末尾が「/」のURL(/ogp-image/)を、メタデータに書く(lib/ogp/metadata.ts)。
export const dynamic = "force-dynamic";

export async function GET() {
  return ogpImageResponse();
}
