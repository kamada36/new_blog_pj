import "server-only";
import { jstDateKey } from "@/lib/viewAnalytics";
import { buildQueueCsv } from "./csv";
import { isDateKey } from "./format";
import { addDaysToDateKey } from "./schedule";
import { loadQueueRows } from "./store";

// 投稿キュー(承認済み・日付と枠が割り当て済みの投稿)を、CSVまたはJSONで返す。
// 管理画面のCSV出力(/admin/api/sns/export/)と、スプレッドシート側のGASが取りに来るAPI(/api/sns-queue/)で共通。
//   from, to : 期間(yyyy-MM-dd、両端を含む)。省略時は 今日 〜 30日後(日本時間)
//   part     : main(メイン投稿。既定) / reply(ツリーの返信。リンク付き)
//   header   : 0 でCSVの見出し行を付けない(既定は付ける)
//   format   : csv(既定) / json(投稿IDなど、重複登録の判定に使える項目を含む)
const DEFAULT_RANGE_DAYS = 30;

export async function buildQueueResponse(params: URLSearchParams, options: { download: boolean }): Promise<Response> {
  const today = jstDateKey(new Date());
  const fromParam = params.get("from");
  const toParam = params.get("to");
  if ((fromParam && !isDateKey(fromParam)) || (toParam && !isDateKey(toParam))) {
    return Response.json({ error: "期間は yyyy-MM-dd の形で指定してください。" }, { status: 400 });
  }
  const from = fromParam || today;
  const to = toParam || addDaysToDateKey(from, DEFAULT_RANGE_DAYS);
  if (from > to) return Response.json({ error: "期間の開始日が終了日より後になっています。" }, { status: 400 });

  const part = params.get("part") === "reply" ? "reply" : "main";
  const rows = await loadQueueRows({ from, to });
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };

  if (params.get("format") === "json") {
    return Response.json(
      {
        from,
        to,
        posts: rows.map((r) => ({
          id: r.id,
          date: r.date,
          slot: r.slot,
          title: r.title,
          url: r.url,
          main: r.mainText,
          reply: r.replyText,
        })),
      },
      { headers }
    );
  }

  const csv = buildQueueCsv(
    rows.map((r) => ({ date: r.date, slot: r.slot, text: part === "reply" ? r.replyText : r.mainText })),
    { header: params.get("header") !== "0" }
  );
  headers["Content-Type"] = "text/csv; charset=utf-8";
  if (options.download) headers["Content-Disposition"] = `attachment; filename="sns-${part}-${from}_${to}.csv"`;
  return new Response(csv, { headers });
}
