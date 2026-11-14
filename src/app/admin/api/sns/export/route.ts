import { getSessionUser } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/ai/httpResponses";
import { buildQueueResponse } from "@/lib/sns/queueResponse";

// SNS投稿キューのCSV出力(管理画面のダウンロード用)。パラメーターは lib/sns/queueResponse.ts を参照。
export async function GET(req: Request) {
  if (!(await getSessionUser())) return unauthorizedResponse();
  return buildQueueResponse(new URL(req.url).searchParams, { download: true });
}
