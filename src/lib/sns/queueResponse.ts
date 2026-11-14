import "server-only";
import { jstDateKey } from "@/lib/viewAnalytics";
import { buildQueueCsv, type QueueCsvRow } from "./csv";
import { isDateKey } from "./format";
import { addDaysToDateKey } from "./schedule";
import { fillMissingTimes, loadQueueRows } from "./store";

// 投稿キュー(承認済み・日付と時間枠が割り当て済みの投稿)を、CSVまたはJSONで返す。
// 管理画面のCSV出力(/admin/api/sns/export/)と、スプレッドシート側のGASが取りに来るAPI(/api/sns-queue/)で共通。
//   from, to : 期間(yyyy-MM-dd、両端を含む)。省略時は 今日 〜 30日後(日本時間)
//   part     : tree(既定。メイン投稿の直後に、その返信(リンク付き)の行を並べる) / main(メイン投稿だけ)
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

  const part = params.get("part") === "main" ? "main" : "tree";
  // 日付・枠があるのに時刻が未設定の投稿(手で日付を入れたものなど)は、ここで時刻を決めてから出力する。
  // 返信の時刻がずれると、メインの直後に投稿できなくなるため、出力のたびに変わらないよう保存する。
  await fillMissingTimes();
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
          time: r.time,
          replyTime: r.replyTime,
          title: r.title,
          url: r.url,
          main: r.mainText,
          reply: r.replyText,
        })),
      },
      { headers }
    );
  }

  const csvRows: QueueCsvRow[] = rows.flatMap((r) => {
    const main: QueueCsvRow = { date: r.date, slot: r.slot, text: r.mainText, time: r.time, tree: false, siteId: r.id };
    const reply: QueueCsvRow = { date: r.date, slot: r.slot, text: r.replyText, time: r.replyTime, tree: true, siteId: `${r.id}_r` };
    return part === "main" ? [main] : [main, reply];
  });
  const csv = buildQueueCsv(csvRows, { header: params.get("header") !== "0" });
  headers["Content-Type"] = "text/csv; charset=utf-8";
  if (options.download) headers["Content-Disposition"] = `attachment; filename="sns-${part}-${from}_${to}.csv"`;
  return new Response(csv, { headers });
}
