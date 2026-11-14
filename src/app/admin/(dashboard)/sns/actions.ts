"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { describeAiError } from "@/lib/ai/provider";
import { isDateKey, isSnsStatus, normalizePostText, type SnsStatus } from "@/lib/sns/format";
import {
  clearUpcomingSchedule,
  generateNextBatch,
  regeneratePost,
  scheduleApprovedPosts,
  type SnsBatchResult,
} from "@/lib/sns/store";

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SESSION_EXPIRED = "セッションが切れました。ログインし直してください。";
const MAX_SLOT_COUNT = 5;

/** 文面のまだ無い公開記事を、数件ぶん作る。画面側が、残りが無くなるまで繰り返し呼ぶ。 */
export async function generateSnsBatchAction(input: { excludeIds: string[] }): Promise<ActionResult<SnsBatchResult>> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  try {
    const result = await generateNextBatch(input.excludeIds.slice(0, 2000));
    return { ok: true, ...result };
  } catch (error) {
    console.error("[sns] 投稿文の一括生成に失敗しました:", error);
    return { ok: false, error: describeAiError(error) };
  }
}

const statusInputSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(500),
  status: z.string(),
});

/** 承認・スキップ・承認待ちへの戻しをまとめて行う。承認済み以外にしたものは、日付・枠の割り当ても外す。 */
export async function setSnsStatusAction(input: { ids: string[]; status: SnsStatus }): Promise<ActionResult<{ count: number }>> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  const parsed = statusInputSchema.safeParse(input);
  if (!parsed.success || !isSnsStatus(parsed.data.status)) return { ok: false, error: "入力内容が正しくありません。" };

  const { ids, status } = parsed.data;
  const result = await prisma.snsPost.updateMany({
    where: { id: { in: ids } },
    data: status === "approved" ? { status } : { status, scheduledDate: null, slot: null },
  });
  return { ok: true, count: result.count };
}

const updateSchema = z.object({
  id: z.string().min(1).max(100),
  mainText: z.string().max(1000),
  replyBody: z.string().max(500),
  scheduledDate: z.string().nullable(),
  slot: z.number().int().min(1).max(MAX_SLOT_COUNT).nullable(),
});

/** 1件の文面・日付・時間枠を保存する。日付と枠は、両方入れるか両方空にする。 */
export async function updateSnsPostAction(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容が正しくありません。" };

  const { id, scheduledDate, slot } = parsed.data;
  const mainText = normalizePostText(parsed.data.mainText);
  const replyBody = normalizePostText(parsed.data.replyBody);
  if (!mainText) return { ok: false, error: "メイン投稿を入力してください。" };
  if (!replyBody) return { ok: false, error: "返信(ツリー)の投稿を入力してください。" };
  if ((scheduledDate === null) !== (slot === null)) return { ok: false, error: "投稿日と時間枠は、両方入力するか、両方空にしてください。" };
  if (scheduledDate !== null && !isDateKey(scheduledDate)) return { ok: false, error: "投稿日は yyyy-MM-dd の形で入力してください。" };

  try {
    await prisma.snsPost.update({ where: { id }, data: { mainText, replyBody, scheduledDate, slot } });
  } catch {
    return { ok: false, error: "投稿が見つかりませんでした。" };
  }
  return { ok: true };
}

/** 1件を、同じ切り口でAIに作り直させる(承認待ちに戻る)。 */
export async function regenerateSnsPostAction(id: string): Promise<ActionResult> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  try {
    await regeneratePost(id);
    return { ok: true };
  } catch (error) {
    console.error("[sns] 投稿文の作り直しに失敗しました:", error);
    return { ok: false, error: describeAiError(error) };
  }
}

const scheduleSchema = z.object({
  postsPerDay: z.number().int().min(1).max(10),
  slotCount: z.number().int().min(1).max(MAX_SLOT_COUNT),
  days: z.number().int().min(1).max(90),
});

/** 承認済みで日付の未定の投稿に、明日以降の日付と時間枠を割り当てる。 */
export async function scheduleSnsAction(input: z.input<typeof scheduleSchema>): Promise<ActionResult<{ scheduled: number; unscheduled: number }>> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容が正しくありません。" };
  const result = await scheduleApprovedPosts(parsed.data);
  return { ok: true, ...result };
}

/** 明日以降の割り当てをすべて解除する(承認は残る)。 */
export async function clearSnsScheduleAction(): Promise<ActionResult<{ count: number }>> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  return { ok: true, count: await clearUpcomingSchedule() };
}
