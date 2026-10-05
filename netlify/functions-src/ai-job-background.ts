import { runAiJob } from "../../src/lib/ai/jobs/runner";
import { verifyJobToken } from "../../src/lib/ai/jobs/token";

// Netlifyのバックグラウンド関数(ファイル名が -background で終わる)。呼び出し元には即座に202が返り、
// この関数の本体は最大15分まで動く(通常の関数は60秒で打ち切られる)。
// 実体は scripts/build-netlify-functions.mjs が、このファイルを依存ごと1つのファイルにまとめて
// netlify/functions/ai-job-background.mjs へ出力する(Gitには入れない)。
// 呼び出し元(app の POST /admin/api/ai-jobs/)だけが計算できるトークンを確認し、第三者の呼び出しは何もせず終える。
export default async function handler(req: Request): Promise<void> {
  const body = (await req.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  if (!jobId || !verifyJobToken(jobId, req.headers.get("x-ai-job-token"))) {
    console.warn("[ai-job] 認証できない呼び出しを無視しました。");
    return;
  }
  await runAiJob(jobId);
}
