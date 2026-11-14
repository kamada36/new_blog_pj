import { timingSafeEqual } from "node:crypto";
import { buildQueueResponse } from "@/lib/sns/queueResponse";

// スプレッドシート側のGASが、投稿予定を取りに来るAPI。環境変数 SNS_QUEUE_TOKEN と同じ値を
// `Authorization: Bearer <トークン>` で送った呼び出しだけを受け付ける。
// 未設定の環境や、トークンの合わない呼び出しには、このAPIがあることも見せない(404)。
// パラメーターは lib/sns/queueResponse.ts を参照(GASは format=json で、投稿IDを使って重複登録を避ける)。
function isAuthorized(req: Request): boolean {
  const expected = process.env.SNS_QUEUE_TOKEN?.trim();
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response(null, { status: 404 });
  return buildQueueResponse(new URL(req.url).searchParams, { download: false });
}
