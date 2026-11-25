import "server-only";
import type { Metadata } from "next";
import { getStoredSiteOgImageUrl } from "./siteImage";
import { OGP_HEIGHT, OGP_WIDTH } from "./size";

/** 共通画像がまだ保存されていないときに指すパス(app/ogp-image/route.ts)。metadataBase を基準に、絶対URLへ展開される。 */
const FALLBACK_OGP_IMAGE_PATH = "/ogp-image/";

/** 共通のOGP画像(ヒーローに似せた画像)。保存済みなら静的ファイルのURL、無ければ生成するURL。 */
export async function getDefaultOgImage() {
  const url = (await getStoredSiteOgImageUrl()) ?? FALLBACK_OGP_IMAGE_PATH;
  return { url, width: OGP_WIDTH, height: OGP_HEIGHT, alt: "レジリエンサーCafe" };
}

/**
 * 記事・固定ページ用の、SNS共有(OGP・Xカード)のメタデータ。
 * 画像は、カバー画像があればそれを、無ければサイト共通の画像を使う。
 * 子のページで openGraph / twitter を指定すると、親(ルートのレイアウト)の指定は丸ごと置き換わる(項目ごとには引き継がれない)ため、
 * サイト名・画像・カードの種類も、ここで指定し直す。
 */
export async function socialMetadata(input: {
  title: string;
  description?: string | null;
  url: string;
  type: "article" | "website";
  imageUrl?: string | null;
}): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  const description = input.description || undefined;
  const image = input.imageUrl ? { url: input.imageUrl } : await getDefaultOgImage();
  return {
    openGraph: {
      type: input.type,
      siteName: "レジリエンサーCafe",
      locale: "ja_JP",
      title: input.title,
      description,
      url: input.url,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description,
      images: [image.url],
    },
  };
}
