import "server-only";

// Cloudflare(サイトの前に置いたCDN)のキャッシュ操作。
//
// 公開ページ(HTML)は、Cloudflareの日本の拠点にもキャッシュして配信する(Cache Rulesで設定)。
// 管理画面で記事などを保存したときは、Netlify側のキャッシュ更新(revalidatePath)に加えて、Cloudflareにキャッシュされた
// HTMLも削除しないと、設定した期間のあいだ、古い内容が返り続ける。
// 公開ページのHTMLには、next.config.ts の headers() で Cache-Tag: site-html を付けているため、そのタグを指定して削除する
// (画像・JS・CSSのキャッシュは残る。Netlifyへの再取得が起きず、クレジットの消費も増えない)。
//
// 必要な環境変数(どれかが未設定なら、何もしない。Cloudflareを使わない環境でも、そのまま動く):
//   CLOUDFLARE_API_TOKEN : APIトークン(権限は「ゾーン > キャッシュの消去(Cache Purge)」のみ)
//   CLOUDFLARE_ZONE_ID   : ゾーンID(Cloudflareのドメインの概要ページにある)

/** 公開ページのHTMLに付ける Cache-Tag の値(next.config.ts と同じ)。 */
export const HTML_CACHE_TAG = "site-html";

/** Cloudflareにキャッシュされた公開ページのHTMLを、すべて削除する。失敗しても例外は投げない(ログのみ)。 */
export async function purgeCloudflareHtml(): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) return;

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [HTML_CACHE_TAG] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.warn(`[cloudflare] キャッシュの削除に失敗しました(HTTP ${res.status}): ${detail}`);
    }
  } catch (error) {
    console.warn("[cloudflare] キャッシュの削除に失敗しました:", (error as Error).message);
  }
}
