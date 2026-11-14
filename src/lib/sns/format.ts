// SNS投稿(X・Threads)の文面まわりの定数と、文字列の整形。画面(クライアント)とサーバーの両方から使うため、Node固有APIには依存しない。

/** 切り口(variant)ごとの名前。同じ記事を日をおいて紹介するとき、文面が重ならないようにする。 */
export const SNS_VARIANTS = [
  { variant: 1, label: "気づき・主張型", brief: "記事の核心を、言い切りの主張・気づきとして短い行で届ける" },
  { variant: 2, label: "問いかけ・共感型", brief: "読者の悩み・疑問に寄り添う問いかけで始め、答えの方向を示す" },
  { variant: 3, label: "要点型", brief: "記事の要点を2〜3個、「・」の箇条書きで端的に並べる" },
] as const;

export const SNS_VARIANT_NUMBERS: number[] = SNS_VARIANTS.map((v) => v.variant);

export function variantLabel(variant: number): string {
  return SNS_VARIANTS.find((v) => v.variant === variant)?.label ?? `パターン${variant}`;
}

/** メイン投稿の文字数の目安(ハッシュタグ・改行込み)。超えると、画面の文字数表示が赤くなる。 */
export const MAIN_MAX_CHARS = 200;
/** 返信(ツリー)の文字数の目安(ハッシュタグ・改行込み。末尾のURLは含まない)。 */
export const REPLY_MAX_CHARS = 160;

export const SNS_STATUSES = ["draft", "approved", "skipped"] as const;
export type SnsStatus = (typeof SNS_STATUSES)[number];

export function isSnsStatus(value: unknown): value is SnsStatus {
  return typeof value === "string" && (SNS_STATUSES as readonly string[]).includes(value);
}

export const SNS_STATUS_LABELS: Record<SnsStatus, string> = {
  draft: "承認待ち",
  approved: "承認済み",
  skipped: "スキップ",
};

/** 絵文字なども1文字として数える。 */
export function countChars(text: string): number {
  return [...text].length;
}

/**
 * 投稿文の整形。改行コードをLFに揃え、行末の空白と、3行以上の連続した空行を整える。
 * CSVに載せるとき、ASCIIのカンマは区切りと紛れて、読み込み側の作りによっては列がずれるため、読点に置き換える
 * (数字の桁区切りは、読点にすると意味が変わるので取り除く)。
 */
export function normalizePostText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u3000]+\n/g, "\n")
    .replace(/\n[ \t\u3000]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/,\s*/g, "、")
    .trim();
}

/** `yyyy-MM-dd` の形か(実在する日付か)を確認する。 */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// ─── 時間枠・時刻 ─────────────────────────────────────────────────────────

export const MAX_TIME_FRAMES = 5;
export const DEFAULT_TIME_FRAMES = "07:30-08:30,12:00-13:00,20:00-22:00";
export const DEFAULT_REPLY_DELAY = { min: 3, max: 7 } as const;

export interface TimeFrame {
  /** 日本時間の HH:mm */
  start: string;
  end: string;
}

/** `HH:mm`(00:00〜23:59)の形か。 */
export function isTimeKey(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 保存用の文字列("07:30-08:30,12:00-13:00,…")を時間枠の配列にする。形式が正しくなければ null。 */
export function parseTimeFrames(raw: string): TimeFrame[] | null {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_TIME_FRAMES) return null;
  const frames: TimeFrame[] = [];
  for (const part of parts) {
    const [start, end] = part.split("-");
    if (!isTimeKey(start) || !isTimeKey(end) || timeToMinutes(start) >= timeToMinutes(end)) return null;
    frames.push({ start, end });
  }
  return frames;
}

export function stringifyTimeFrames(frames: TimeFrame[]): string {
  return frames.map((f) => `${f.start}-${f.end}`).join(",");
}
