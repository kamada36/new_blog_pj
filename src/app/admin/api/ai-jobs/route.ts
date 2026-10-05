import { after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badRequestResponse, unauthorizedResponse } from "@/lib/ai/httpResponses";
import { isAiJobKind } from "@/lib/ai/jobKinds";
import { getProviderForModel } from "@/lib/ai/models";
import { runAiJob } from "@/lib/ai/jobs/runner";
import { createAiJob, TooManyJobsError, triggerBackgroundFunction } from "@/lib/ai/jobs/start";
import { articleRequestSchema, outlineRequestSchema, rewriteRequestSchema } from "@/lib/ai/schemas";

// AI処理(構成案・本文生成・リライト)の開始。
// ここでは入力を検証してジョブをDBへ登録し、実行を依頼するだけで、すぐに jobId を返す(数秒以内に終わる)。
// 実際の処理は、Netlifyではバックグラウンド関数(最大15分)、ローカルではこのサーバーの中で動く。
// 進捗は GET /admin/api/ai-jobs/{id}/ で読み取る。

const SCHEMAS = {
  outline: outlineRequestSchema,
  article: articleRequestSchema,
  rewrite: rewriteRequestSchema,
} as const;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const raw = (await req.json().catch(() => null)) as { kind?: unknown; input?: unknown } | null;
  if (!raw || !isAiJobKind(raw.kind)) return badRequestResponse("処理の種類が正しくありません。");

  const parsed = SCHEMAS[raw.kind].safeParse(raw.input);
  if (!parsed.success) return badRequestResponse(parsed.error.issues[0]?.message ?? "入力内容が正しくありません。");
  if (raw.kind === "outline" && getProviderForModel((parsed.data as { modelId: string }).modelId) !== "gemini") {
    return badRequestResponse("構成案の生成(リサーチ)は、Google検索が使えるGeminiモデルのみ対応しています。");
  }

  let job;
  try {
    job = await createAiJob({ kind: raw.kind, input: parsed.data, userId: user.id });
  } catch (error) {
    if (error instanceof TooManyJobsError) return Response.json({ error: error.message }, { status: 429 });
    throw error;
  }

  if (process.env.AI_JOB_MODE === "netlify") {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    try {
      await triggerBackgroundFunction(job.id, `${proto}://${host}`);
    } catch (error) {
      console.error("[ai-job] バックグラウンド関数の起動に失敗しました:", error);
      await prisma.aiJob.update({ where: { id: job.id }, data: { status: "error" } });
      return Response.json({ error: "バックグラウンド処理を開始できませんでした。時間をおいてもう一度お試しください。" }, { status: 502 });
    }
  } else {
    // ローカル(next dev / next start): このサーバーのプロセス内で、レスポンスを返した後に実行する
    after(() => runAiJob(job.id));
  }

  return Response.json({ jobId: job.id });
}
