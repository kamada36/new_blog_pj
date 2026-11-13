"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { syncAllArticleAffiliateLinks } from "@/lib/affiliateStore";

const PAGE_PATH = "/admin/affiliates";

function finish(kind: "notice" | "error", message: string): never {
  revalidatePath(PAGE_PATH);
  revalidatePath("/admin/articles");
  redirect(`${PAGE_PATH}?${kind}=${encodeURIComponent(message)}`);
}

const programSchema = z.object({
  name: z.string().trim().min(1, "サービス名を入力してください").max(100, "サービス名は100文字以内にしてください"),
  memo: z.string().trim().max(500, "メモは500文字以内にしてください"),
});

/** 全記事の本文を読み直して、リンク情報を作り直す。記事を直接DBで書き換えた後や、取りこぼしの確認に使う。 */
export async function rescanAffiliateLinks() {
  if (!(await getSessionUser())) return finish("error", "セッションが切れました。再度ログインしてください。");

  const summary = await syncAllArticleAffiliateLinks(prisma);
  finish(
    "notice",
    `再スキャンしました: 記事${summary.articles}件のうち、リンクあり${summary.articlesWithLinks}件 / リンク${summary.links}件` +
      (summary.programsCreated > 0 ? ` / 新しいサービス${summary.programsCreated}件を追加` : "")
  );
}

export async function updateAffiliateProgram(id: string, formData: FormData) {
  if (!(await getSessionUser())) return finish("error", "セッションが切れました。再度ログインしてください。");

  const parsed = programSchema.safeParse({ name: formData.get("name"), memo: formData.get("memo") ?? "" });
  if (!parsed.success) return finish("error", parsed.error.issues[0]?.message ?? "入力内容をご確認ください。");

  await prisma.affiliateProgram.update({ where: { id }, data: parsed.data });
  finish("notice", `「${parsed.data.name}」を保存しました。`);
}

/** 記事に1件もリンクが残っていないサービスだけ削除できる。 */
export async function deleteAffiliateProgram(id: string) {
  if (!(await getSessionUser())) return finish("error", "セッションが切れました。再度ログインしてください。");

  const program = await prisma.affiliateProgram.findUnique({
    where: { id },
    select: { name: true, _count: { select: { links: true } } },
  });
  if (!program) return finish("error", "サービスが見つかりませんでした。");
  if (program._count.links > 0) return finish("error", "記事で使われているサービスは削除できません。");

  await prisma.affiliateProgram.delete({ where: { id } });
  finish("notice", `「${program.name}」を削除しました。`);
}
