import { getSessionUser } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/ai/httpResponses";

// 公開ページの管理バー(「ダッシュボードへ」「〇〇としてログイン中」)用。ログイン中の管理者の名前だけを返す。
// 公開ページは全員に同じHTMLをキャッシュ配信するため、ログイン状態は、ブラウザ側でこのAPIから取得する。
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  return Response.json({ name: user.name }, { headers: { "Cache-Control": "private, no-store" } });
}
