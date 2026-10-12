// バックグラウンドで実行するAI処理の種類。画面(クライアント)とサーバーの両方から使うため、Node固有APIには依存しない。
export const AI_JOB_KINDS = ["outline", "article", "rewrite"] as const;
export type AiJobKind = (typeof AI_JOB_KINDS)[number];

export function isAiJobKind(value: unknown): value is AiJobKind {
  return typeof value === "string" && (AI_JOB_KINDS as readonly string[]).includes(value);
}
