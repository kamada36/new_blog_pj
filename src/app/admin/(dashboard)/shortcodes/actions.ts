"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveImageField } from "@/lib/uploadField";

const shortcodeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "ショートコード名を入力してください")
    .max(50)
    .regex(/^[\w-]+$/, "ショートコード名は英数字・ハイフン・アンダースコアのみ使用できます"),
  position: z.enum(["l", "r"]),
  defaultTalk: z.string().trim().min(1).max(500),
});

function redirectWithError(message: string) {
  redirect(`/admin/shortcodes?error=${encodeURIComponent(message)}`);
}

function parseShortcodeForm(formData: FormData) {
  return shortcodeSchema.safeParse({
    name: formData.get("name"),
    position: formData.get("position"),
    defaultTalk: String(formData.get("defaultTalk") ?? "").trim() || "コメント",
  });
}

export async function createShortcode(formData: FormData) {
  const parsed = parseShortcodeForm(formData);
  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "入力内容をご確認ください。");
    return;
  }

  const iconUrl = await resolveImageField(formData, "icon", "shortcodes", "setting");
  if (!iconUrl) {
    redirectWithError("アイコン画像を選択してください。");
    return;
  }

  const duplicate = await prisma.shortcode.findUnique({ where: { name: parsed.data.name } });
  if (duplicate) {
    redirectWithError("このショートコード名は既に使用されています。");
    return;
  }

  await prisma.shortcode.create({ data: { ...parsed.data, iconUrl } });
  revalidatePath("/admin/shortcodes");
  revalidatePath("/", "layout");
}

export async function updateShortcode(id: string, formData: FormData) {
  const parsed = parseShortcodeForm(formData);
  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "入力内容をご確認ください。");
    return;
  }

  const duplicate = await prisma.shortcode.findFirst({ where: { name: parsed.data.name, NOT: { id } } });
  if (duplicate) {
    redirectWithError("このショートコード名は既に使用されています。");
    return;
  }

  const iconUrl = await resolveImageField(formData, "icon", "shortcodes", "setting");

  await prisma.shortcode.update({
    where: { id },
    data: { ...parsed.data, ...(iconUrl ? { iconUrl } : {}) },
  });
  revalidatePath("/admin/shortcodes");
  revalidatePath("/", "layout");
}

export async function deleteShortcode(id: string) {
  await prisma.shortcode.delete({ where: { id } });
  revalidatePath("/admin/shortcodes");
  revalidatePath("/", "layout");
}
