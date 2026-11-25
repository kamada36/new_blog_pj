import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { getSiteSetting } from "@/lib/queries";
import { getPublicUrl, objectExistsInR2, putObjectToR2 } from "@/lib/r2";
import type { OgpSources } from "./render";

/**
 * サイト共通のOGP画像を、一度だけ作ってR2に保存し、以後はその静的ファイルを使う。
 * SNSのクローラーが取りに来るたびに画像を作ると数秒かかり、時間切れでカードが出ない恐れがあるため。
 *
 * ファイル名は、素材(ヒーロー画像のURL)とデザインの版から決まる。素材を差し替えると名前が変わるので、
 * 作り直しの管理(DBへの記録や削除)は要らず、SNSやCDNに残った古い画像が使われ続けることもない。
 * 古いファイルは、過去の投稿が参照している可能性があるので、削除しない。
 */

/** 画像のデザイン(render.tsx)を変えたら、この数字を増やす。増やさないと、保存済みの古い画像が使われ続ける。 */
const DESIGN_VERSION = 1;

type HeroSetting = {
  heroBackgroundUrl: string | null;
  heroBackgroundMobileUrl: string | null;
  heroCharacterResilientUrl: string | null;
  heroCharacterAikoUrl: string | null;
};

function sourcesOf(setting: HeroSetting): OgpSources {
  return {
    photoUrl: setting.heroBackgroundUrl ?? setting.heroBackgroundMobileUrl,
    resilientUrl: setting.heroCharacterResilientUrl,
    aikoUrl: setting.heroCharacterAikoUrl,
  };
}

function imageKey({ photoUrl, resilientUrl, aikoUrl }: OgpSources): string {
  const digest = createHash("sha256").update(JSON.stringify([DESIGN_VERSION, photoUrl, resilientUrl, aikoUrl])).digest("hex");
  return `ogp/site-${digest.slice(0, 16)}.jpg`;
}

/** 保存済みと確認できたキー(同じサーバーが動いている間は、R2への問い合わせを繰り返さない) */
const storedKeys = new Set<string>();

async function isStored(key: string): Promise<boolean> {
  if (storedKeys.has(key)) return true;
  try {
    const exists = await objectExistsInR2(key);
    if (exists) storedKeys.add(key);
    return exists;
  } catch (e) {
    console.error("[ogp] R2の確認に失敗しました。", e);
    return false;
  }
}

/** 画像を作り、素材がすべてそろっていればR2に保存する。保存に失敗しても、作った画像は返す。 */
async function createImage(sources: OgpSources, key: string): Promise<{ body: Buffer; stored: boolean }> {
  // 画像処理のライブラリは大きいので、画像を実際に作るときだけ読み込む(このファイルは全ページのレイアウトから参照される)
  const { renderOgpJpeg } = await import("./render");
  const { body, complete } = await renderOgpJpeg(sources);
  if (!complete) {
    console.warn("[ogp] 素材の一部を取得できなかったため、画像を保存しません。");
    return { body, stored: false };
  }
  try {
    await putObjectToR2(key, body, "image/jpeg", "public, max-age=31536000, immutable");
    storedKeys.add(key);
    return { body, stored: true };
  } catch (e) {
    console.error("[ogp] R2への保存に失敗しました。", e);
    return { body, stored: false };
  }
}

/** 保存済みの共通OGP画像の公開URL。まだ保存されていなければ null。 */
export const getStoredSiteOgImageUrl = cache(async function getStoredSiteOgImageUrl(): Promise<string | null> {
  const key = imageKey(sourcesOf(await getSiteSetting()));
  return (await isStored(key)) ? getPublicUrl(key) : null;
});

/**
 * 今の設定の画像が保存されていなければ、作って保存する(ヒーロー画像を変えたときに呼ぶ)。
 * 失敗しても例外にしない(設定の保存は成功させる。画像は /ogp-image/ へのアクセスで、あとから作られる)。
 */
export async function ensureSiteOgImage(setting: HeroSetting): Promise<void> {
  try {
    const sources = sourcesOf(setting);
    const key = imageKey(sources);
    if (!(await isStored(key))) await createImage(sources, key);
  } catch (e) {
    console.error("[ogp] 共通画像の作成に失敗しました。", e);
  }
}

/** /ogp-image/ 用: 今の設定の画像(JPEG)を返す。保存済みならそれを、無ければ作って保存する。 */
export async function loadSiteOgImage(): Promise<{ body: Buffer; stored: boolean }> {
  const sources = sourcesOf(await getSiteSetting());
  const key = imageKey(sources);
  if (await isStored(key)) {
    try {
      const res = await fetch(getPublicUrl(key), { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (res.ok) return { body: Buffer.from(await res.arrayBuffer()), stored: true };
    } catch (e) {
      console.error("[ogp] 保存済み画像の取得に失敗したため、作り直します。", e);
    }
  }
  return createImage(sources, key);
}
