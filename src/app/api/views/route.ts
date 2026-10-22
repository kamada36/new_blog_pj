import { after } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getViewRequestContext } from "@/lib/analytics";
import { recordArticleView } from "@/lib/queries";

// 記事の閲覧数の記録。公開ページ(CDNにキャッシュされる)は、サーバー側で閲覧を記録できないため、
// 記事ページを表示したブラウザが、表示後にここへ1回だけ送信する。
//   - JavaScriptを実行しないボット・クローラーは、送信しないので、自然に除外される。
//   - ボットのUser-Agent、管理者(ログイン中)、他サイトからの送信は、記録しない。
//   - 同じ訪問者の同じ記事は24時間に1回(recordArticleView の重複排除)。
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  // 同じサイトのページからの送信だけを受け付ける(ブラウザは、POSTに必ずOriginを付ける)
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(origin && host && new URL(origin).host === host);
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return new Response(null, { status: 403, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as { articleId?: unknown } | null;
  const articleId = typeof body?.articleId === "string" ? body.articleId : "";
  if (!articleId || articleId.length > 64) return new Response(null, { status: 400, headers: NO_STORE });

  const { isBot, visitorHash } = await getViewRequestContext();
  if (isBot) return new Response(null, { status: 204, headers: NO_STORE });

  // 管理者自身の閲覧はカウントしない(署名の検証だけ。DBは見ない)
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) return new Response(null, { status: 204, headers: NO_STORE });

  // 記録(DB書き込み)は、レスポンスを返した後に行う。存在しない記事IDは、外部キーのエラーで、何も記録されない。
  after(async () => {
    try {
      await recordArticleView(articleId, visitorHash);
    } catch (error) {
      console.warn("[views] 閲覧の記録に失敗しました(存在しない記事ID等):", (error as Error).message);
    }
  });
  return new Response(null, { status: 204, headers: NO_STORE });
}
