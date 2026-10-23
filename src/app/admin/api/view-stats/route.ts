import { getSessionUser } from "@/lib/auth";
import { getArticleViewStatsMap } from "@/lib/queries";
import { badRequestResponse, unauthorizedResponse } from "@/lib/ai/httpResponses";

// 公開ページの記事カードに出す、管理者向けの閲覧数(本日・週・月・全体)。
// 記事IDの一覧を受け取り、IDごとの統計を返す。ログイン中の管理者だけが使える。
const MAX_IDS = 80;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64))]
    : [];
  if (ids.length === 0 || ids.length > MAX_IDS) return badRequestResponse("記事IDの指定が正しくありません。");

  const map = await getArticleViewStatsMap(ids);
  return Response.json(Object.fromEntries(map), { headers: { "Cache-Control": "private, no-store" } });
}
