"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

const tagSchema = z.object({
  name: z.string().trim().min(1).max(30),
  slug: z.string().trim().min(1).max(40),
});

function redirectWithError(message: string) {
  redirect(`/admin/tags?error=${encodeURIComponent(message)}`);
}

export async function createTag(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const parsed = tagSchema.safeParse({ name, slug: String(formData.get("slug") ?? "") || slugify(name) });
  if (!parsed.success) {
    redirectWithError("入力内容をご確認ください。");
    return;
  }
  await prisma.tag.create({ data: parsed.data });
  revalidatePath("/admin/tags");
}

export async function updateTag(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const parsed = tagSchema.safeParse({ name, slug: String(formData.get("slug") ?? "") || slugify(name) });
  if (!parsed.success) {
    redirectWithError("入力内容をご確認ください。");
    return;
  }
  await prisma.tag.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/tags");
}

export async function deleteTag(id: string) {
  await prisma.tag.delete({ where: { id } });
  revalidatePath("/admin/tags");
}
