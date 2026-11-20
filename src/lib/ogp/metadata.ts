import type { Metadata } from "next";

/** サイト共通のOGP画像のパス(app/ogp-image/route.tsx)。metadataBase を基準に、絶対URLへ展開される。 */
export const DEFAULT_OGP_IMAGE_PATH = "/ogp-image/";

export const OGP_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** 共通のOGP画像(ヒーローに似せた画像)。 */
export const defaultOgpImage = { url: DEFAULT_OGP_IMAGE_PATH, ...OGP_IMAGE_SIZE, alt: "レジリエンサーCafe" };

/**
 * 記事・固定ページ用の、SNS共有(OGP・Xカード)のメタデータ。
 * 画像は、カバー画像があればそれを、無ければサイト共通の画像を使う。
 * 子のページで openGraph / twitter を指定すると、親(ルートのレイアウト)の指定は丸ごと置き換わる(項目ごとには引き継がれない)ため、
 * サイト名・画像・カードの種類も、ここで指定し直す。
 */
export function socialMetadata(input: {
  title: string;
  description?: string | null;
  url: string;
  type: "article" | "website";
  imageUrl?: string | null;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const description = input.description || undefined;
  const image = input.imageUrl ? { url: input.imageUrl } : defaultOgpImage;
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
