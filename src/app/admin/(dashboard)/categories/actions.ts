"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { resolveImageField } from "@/lib/uploadField";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  slug: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional().default(""),
  order: z.coerce.number().int().default(0),
});

function redirectWithError(message: string) {
  redirect(`/admin/categories?error=${encodeURIComponent(message)}`);
}

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const parsed = categorySchema.safeParse({
    name,
    slug: String(formData.get("slug") ?? "") || slugify(name),
    description: formData.get("description") ?? "",
    order: formData.get("order") ?? 0,
  });
  if (!parsed.success) {
    redirectWithError("入力内容をご確認ください。");
    return;
  }
  const iconUrl = await resolveImageField(formData, "icon", "categories", "setting");
  await prisma.category.create({ data: { ...parsed.data, ...(iconUrl ? { iconUrl } : {}) } });
  revalidatePath("/");
  revalidatePath("/admin/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const parsed = categorySchema.safeParse({
    name,
    slug: String(formData.get("slug") ?? "") || slugify(name),
    description: formData.get("description") ?? "",
    order: formData.get("order") ?? 0,
  });
  if (!parsed.success) {
    redirectWithError("入力内容をご確認ください。");
    return;
  }
  const iconUrl = await resolveImageField(formData, "icon", "categories", "setting");
  await prisma.category.update({ where: { id }, data: { ...parsed.data, ...(iconUrl ? { iconUrl } : {}) } });
  revalidatePath("/");
  revalidatePath("/admin/categories");
}

export async function deleteCategory(id: string) {
  const usageCount = await prisma.article.count({ where: { categoryId: id } });
  if (usageCount > 0) {
    redirectWithError("記事が紐づいているカテゴリーは削除できません。");
    return;
  }
  await prisma.category.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/categories");
}
