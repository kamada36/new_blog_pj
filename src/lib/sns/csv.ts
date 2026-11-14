// スプレッドシートの投稿ツールが読み込むCSV。列は「投稿日, 投稿時間枠, 投稿内容」。
//   - 投稿日は yyyy-MM-dd。投稿時間枠は1以上の整数で、枠ごとの時刻と枠内のばらつきはツール側で決める。
//   - 投稿内容の改行は、実際の改行ではなく、文字としての「\n」(バックスラッシュとn)で表す。
// 画面(管理画面のCSV出力)と、ツールが取りに来るAPIの両方で、同じ組み立てを使う。

export interface QueueCsvRow {
  date: string;
  slot: number;
  text: string;
}

export const CSV_HEADER = ["投稿日", "投稿時間枠", "投稿内容"];

export function escapeCsvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 投稿内容の改行を、文字としての「\n」に置き換える。 */
export function escapeLineBreaks(text: string): string {
  return text.replace(/\r\n?|\n/g, "\\n");
}

export function buildQueueCsv(rows: QueueCsvRow[], options: { header: boolean }): string {
  const lines: (string | number)[][] = rows.map((row) => [row.date, row.slot, escapeLineBreaks(row.text)]);
  if (options.header) lines.unshift(CSV_HEADER);
  return lines.map((line) => line.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}
