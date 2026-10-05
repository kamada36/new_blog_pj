import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { describeAiError, isAbortError } from "@/lib/ai/provider";
import { articleRequestSchema, outlineRequestSchema, rewriteRequestSchema } from "@/lib/ai/schemas";
import type { ArticleStreamEvent, OutlineStreamEvent, RewriteStreamEvent } from "@/lib/ai/stream";
import { runArticleJob } from "./article";
import type { JobContext } from "./context";
import { runOutlineJob } from "./outline";
import { runRewriteJob } from "./rewrite";

// AIジョブの実行。Netlifyのバックグラウンド関数(最大15分)と、ローカル(Next.jsのサーバー内)の両方から呼ばれる。
// 処理の途中経過は「イベント」としてDB(AiJobEvent)へ書き、画面が定期的に読み取る。
//   - 本文の断片(delta)は細かく届くため、1秒ぶんをまとめて1件にする(DBまでの往復が遅い環境でも間に合わせる)。
//   - 1秒ごとに updatedAt を更新する(心拍)。更新が止まったジョブは、読み取り側が「中断された」と判定する。
//   - 画面から取り消されたら(status = canceled)、AIの呼び出しを中断する。

const TICK_MS = 1000;

type AnyEvent = { type: string; text?: string };

export async function runAiJob(jobId: string): Promise<void> {
  // 二重起動(再送など)や、起動前に取り消されたジョブは何もしない
  const claimed = await prisma.aiJob.updateMany({ where: { id: jobId, status: "queued" }, data: { status: "running" } });
  if (claimed.count === 0) return;

  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const controller = new AbortController();
  const startedAt = Date.now();

  let pendingDelta = "";
  let writes: Promise<unknown> = Promise.resolve();

  const enqueue = (payload: AnyEvent) => {
    writes = writes
      .then(() => prisma.aiJobEvent.create({ data: { jobId, payload: payload as Prisma.InputJsonValue } }))
      .catch((error) => console.error("[ai-job] イベントの保存に失敗しました:", error));
  };
  const flushDelta = () => {
    if (!pendingDelta) return;
    enqueue({ type: "delta", text: pendingDelta });
    pendingDelta = "";
  };
  const send = (event: AnyEvent) => {
    if (event.type === "delta" && typeof event.text === "string") {
      pendingDelta += event.text;
      return;
    }
    flushDelta();
    enqueue(event);
  };

  let ticking = false;
  const timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      flushDelta();
      const row = await prisma.aiJob.update({ where: { id: jobId }, data: { updatedAt: new Date() }, select: { status: true } });
      if (row.status === "canceled") controller.abort();
    } catch (error) {
      console.error("[ai-job] 心拍の更新に失敗しました:", error);
    } finally {
      ticking = false;
    }
  }, TICK_MS);

  let finalStatus: "done" | "error" | "canceled" = "done";
  try {
    const base = { userId: job.userId, signal: controller.signal, startedAt };
    switch (job.kind) {
      case "outline":
        await runOutlineJob(outlineRequestSchema.parse(job.input), { ...base, send } as JobContext<OutlineStreamEvent>);
        break;
      case "article":
        await runArticleJob(articleRequestSchema.parse(job.input), { ...base, send } as JobContext<ArticleStreamEvent>);
        break;
      case "rewrite":
        await runRewriteJob(rewriteRequestSchema.parse(job.input), { ...base, send } as JobContext<RewriteStreamEvent>);
        break;
      default:
        throw new Error(`未対応のジョブ種別です: ${job.kind}`);
    }
  } catch (error) {
    const aborted = controller.signal.aborted || isAbortError(error);
    finalStatus = aborted ? "canceled" : "error";
    console.error(`[ai-job] ジョブ ${jobId}(${job.kind})が${aborted ? "中断" : "失敗"}しました:`, aborted ? "" : error);
    const modelId = (job.input as { modelId?: string } | null)?.modelId;
    flushDelta();
    enqueue({ type: "error", message: aborted ? "生成を中断しました。" : describeAiError(error, modelId) } as AnyEvent & { message: string });
  } finally {
    clearInterval(timer);
    flushDelta();
    await writes;
    // 取り消されたジョブの status(canceled)は上書きしない
    await prisma.aiJob.updateMany({ where: { id: jobId, status: "running" }, data: { status: finalStatus } });
  }
}
