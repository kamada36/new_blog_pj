import "server-only";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { purgeCloudflareHtml } from "@/lib/cloudflare";

// Netlify側のキャッシュ更新(revalidatePath)が反映されてから、Cloudflareのキャッシュを削除するまでの待ち時間。
// 先に削除すると、Cloudflareが、まだ古いNetlifyのキャッシュを取り直して、古い内容を再びキャッシュしてしまう。
const PURGE_DELAY_MS = 3000;

/**
 * 公開ページ(HTML)のCloudflareキャッシュを、レスポンスを返した後で、削除する。
 * Server Action・Route Handlerの中(リクエストの文脈がある場所)から呼ぶこと。
 */
export function purgeCloudflareHtmlAfterResponse(): void {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, PURGE_DELAY_MS));
    await purgeCloudflareHtml();
  });
}

/**
 * 公開ページ全体を更新する: Netlify側のキャッシュ(revalidatePath)と、Cloudflareにキャッシュされた公開ページのHTML。
 * ヘッダー・サイドバー・一覧など全ページに出る内容が変わるときに使う。
 */
export function revalidateSite(): void {
  revalidatePath("/", "layout");
  purgeCloudflareHtmlAfterResponse();
}
