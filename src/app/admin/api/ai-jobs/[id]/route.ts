import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/ai/httpResponses";

// GET: ジョブの進捗(「after」より後のイベント)を返す。画面が1秒ごとに呼ぶ。
// DELETE: ジョブの取り消し。実行側が、次の心拍(1秒以内)で気づいてAIの呼び出しを中断する。
// 認証は、署名つきのセッションCookieの検証だけで行う(proxy.tsで/adminへのアクセスは検証済み。
// 毎秒のDB照会を減らすため、ユーザーの再読み込みはしない)。

// 心拍(1秒ごとに更新)がこの時間止まっていたら、実行側が止まった(関数のクラッシュなど)とみなす
const RUNNING_STALE_MS = 90_000;
// 登録されてからこの時間たっても実行が始まらなければ、バックグラウンド関数が起動しなかったとみなす
const QUEUED_STALE_MS = 45_000;

type Params = { params: Promise<{ id: string }> };

async function getSessionSubject(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await verifySessionToken(token))?.sub ?? null;
}

const readEvents = (jobId: string, after: number) =>
  prisma.aiJobEvent.findMany({
    where: { jobId, id: { gt: after } },
    orderBy: { id: "asc" },
    take: 500,
    select: { id: true, payload: true },
  });

export async function GET(req: Request, { params }: Params) {
  const subject = await getSessionSubject();
  if (!subject) return unauthorizedResponse();

  const { id } = await params;
  const after = Number(new URL(req.url).searchParams.get("after")) || 0;

  const [job, firstRead] = await Promise.all([
    prisma.aiJob.findUnique({ where: { id }, select: { status: true, userId: true, updatedAt: true } }),
    readEvents(id, after),
  ]);
  if (!job || job.userId !== subject) return Response.json({ error: "ジョブが見つかりません。" }, { status: 404 });

  let status = job.status;
  let events = firstRead;

  const idleMs = Date.now() - job.updatedAt.getTime();
  const stale =
    (job.status === "running" && idleMs > RUNNING_STALE_MS) || (job.status === "queued" && idleMs > QUEUED_STALE_MS);
  if (stale) {
    const marked = await prisma.aiJob.updateMany({ where: { id, status: job.status }, data: { status: "error" } });
    if (marked.count > 0) {
      await prisma.aiJobEvent.create({
        data: {
          jobId: id,
          payload: {
            type: "error",
            message:
              job.status === "queued"
                ? "バックグラウンド処理が開始されませんでした。時間をおいてもう一度お試しください。"
                : "処理が途中で止まりました(バックグラウンド処理が応答しなくなりました)。もう一度お試しください。",
          },
        },
      });
    }
    status = "error";
    events = await readEvents(id, after);
  }

  return Response.json({ status, events }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_req: Request, { params }: Params) {
  const subject = await getSessionSubject();
  if (!subject) return unauthorizedResponse();

  const { id } = await params;
  await prisma.aiJob.updateMany({
    where: { id, userId: subject, status: { in: ["queued", "running"] } },
    data: { status: "canceled" },
  });
  return Response.json({ ok: true });
}
