import { createHmac, timingSafeEqual } from "node:crypto";

// Next.js側(ジョブの作成)からバックグラウンド関数を呼び出すときの、呼び出し元の確認用トークン。
// 公開されている関数のURLへ、第三者が任意のジョブIDを送って処理を起動できないようにする。
// AUTH_SECRET から、ジョブIDごとに計算する(両者が同じ環境変数を持つため、追加の設定は要らない)。

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET が設定されていません。");
  return value;
}

export function createJobToken(jobId: string): string {
  return createHmac("sha256", secret()).update(`ai-job:${jobId}`).digest("hex");
}

export function verifyJobToken(jobId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(createJobToken(jobId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
