// スプレッドシートの投稿ツールが読み込むCSV。列は次の8つ(左から順に読まれ、右の列は省略できる)。
//   投稿日, 投稿時間枠, 投稿内容, to_X, to_Thr, 予定投稿時間, ツリー, サイトID
//   - 投稿日は yyyy-MM-dd。投稿時間枠は1以上の整数(ツール側の枠の検証を通すため、返信にもメインと同じ値を入れる)。
//   - 投稿内容の改行・空行は、実際の改行ではなく、文字としての「\n」(バックスラッシュとn)で表す。
//   - 予定投稿時間は HH:mm。サイト側で、時間枠の範囲内のランダムな時刻を決めて渡す(ツール側ではランダムにしない)。
//   - ツリーが 1 の行は、直前のツリー0の行(メイン投稿)に続く返信。返信の行は、必ずメインの行の直後に置く。
//   - サイトIDは、サイトの投稿のID(返信は末尾に _r を付ける)。ツール側は、これがシートに登録済みの行を取り込まず、
//     同じCSVを2回読み込んでも二重に登録されないようにする。
// 画面(管理画面のCSV出力)と、ツールが取りに来るAPIの両方で、同じ組み立てを使う。

export interface QueueCsvRow {
  date: string;
  slot: number;
  text: string;
  /** HH:mm。未設定なら空欄(ツール側が、時間枠の範囲内でランダムに決める) */
  time: string | null;
  /** 返信(ツリー)の行か */
  tree: boolean;
  /** サイトの投稿ID(返信は末尾に _r)。ツール側の二重登録の防止に使う */
  siteId: string;
}

export const CSV_HEADER = ["投稿日", "投稿時間枠", "投稿内容", "to_X", "to_Thr", "予定投稿時間", "ツリー", "サイトID"];

export function escapeCsvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 投稿内容の改行を、文字としての「\n」に置き換える。 */
export function escapeLineBreaks(text: string): string {
  return text.replace(/\r\n?|\n/g, "\\n");
}

export function buildQueueCsv(rows: QueueCsvRow[], options: { header: boolean }): string {
  const lines: (string | number)[][] = rows.map((row) => [
    row.date,
    row.slot,
    escapeLineBreaks(row.text),
    1, // to_X
    1, // to_Thr
    row.time ?? "",
    row.tree ? 1 : 0,
    row.siteId,
  ]);
  if (options.header) lines.unshift(CSV_HEADER);
  return lines.map((line) => line.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}
