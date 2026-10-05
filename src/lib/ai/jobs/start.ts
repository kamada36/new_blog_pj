import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AiJobKind } from "@/lib/ai/jobKinds";
import { createJobToken } from "./token";

// 同時に動かせるジョブの数(操作ミスや連打で、AIの利用料が膨らむのを防ぐ)。
// 心拍が止まった古いジョブは数えない(下の ACTIVE_WINDOW_MS)。
const MAX_ACTIVE_JOBS = 3;
const ACTIVE_WINDOW_MS = 20 * 60 * 1000;
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export class TooManyJobsError extends Error {
  constructor() {
    super("実行中のAI処理が多すぎます。いくつか終わってから、もう一度お試しください。");
  }
}

export async function createAiJob(params: { kind: AiJobKind; input: unknown; userId: string }) {
  // 古いジョブ(とそのイベント。連動して削除される)を掃除する
  await prisma.aiJob.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });

  const active = await prisma.aiJob.count({
    where: {
      userId: params.userId,
      status: { in: ["queued", "running"] },
      updatedAt: { gt: new Date(Date.now() - ACTIVE_WINDOW_MS) },
    },
  });
  if (active >= MAX_ACTIVE_JOBS) throw new TooManyJobsError();

  return prisma.aiJob.create({
    data: { kind: params.kind, input: params.input as Prisma.InputJsonValue, userId: params.userId },
  });
}

/** Netlifyのバックグラウンド関数を起動する。関数は即座に202を返し、本体は最大15分まで動く。 */
export async function triggerBackgroundFunction(jobId: string, origin: string): Promise<void> {
  const response = await fetch(`${origin}/.netlify/functions/ai-job-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ai-job-token": createJobToken(jobId) },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    throw new Error(`バックグラウンド関数を起動できませんでした(HTTP ${response.status})。`);
  }
}
