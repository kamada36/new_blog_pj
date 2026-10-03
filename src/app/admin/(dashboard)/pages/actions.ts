"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isReservedSlug, slugify } from "@/lib/slug";

const pageSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "タイトルを入力してください").max(100),
  slug: z
    .string()
    .trim()
    .min(1, "スラッグを入力してください")
    .regex(/^[^\s/?#]+$/, "スラッグに空白や / ? # は使用できません"),
  contentMarkdown: z.string().min(1, "本文を入力してください"),
  metaTitle: z.string().trim().max(200).optional().default(""),
  metaDescription: z.string().trim().max(300).optional().default(""),
});

export type PageFormState = {
  status: "idle" | "error";
  message?: string;
};

export async function savePage(_prevState: PageFormState, formData: FormData): Promise<PageFormState> {
  const rawTitle = String(formData.get("title") ?? "");
  const parsed = pageSchema.safeParse({
    id: formData.get("id") || undefined,
    title: rawTitle,
    slug: String(formData.get("slug") ?? "") || slugify(rawTitle),
    contentMarkdown: formData.get("contentMarkdown") ?? "",
    metaTitle: formData.get("metaTitle") ?? "",
    metaDescription: formData.get("metaDescription") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "入力内容をご確認ください。" };
  }

  const data = parsed.data;
  const duplicate = await prisma.page.findFirst({
    where: { slug: data.slug, NOT: data.id ? { id: data.id } : undefined },
  });
  if (duplicate) {
    return { status: "error", message: "このスラッグは既に使用されています。" };
  }
  // 固定ページも /{slug}/ で表示するため、サイトのパスや記事と同名にはできない(「プロフィール」ページの profile だけは例外)
  if (data.slug !== "profile" && isReservedSlug(data.slug)) {
    return { status: "error", message: "このスラッグはサイトのページで使われているため、使用できません。" };
  }
  const articleClash = await prisma.article.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (articleClash) {
    return { status: "error", message: "このスラッグは記事で使われているため、使用できません。" };
  }

  const payload = {
    title: data.title,
    slug: data.slug,
    contentMarkdown: data.contentMarkdown,
    metaTitle: data.metaTitle,
    metaDescription: data.metaDescription,
  };

  if (data.id) {
    await prisma.page.update({ where: { id: data.id }, data: payload });
  } else {
    await prisma.page.create({ data: payload });
  }

  revalidatePath(`/${data.slug}`);
  revalidatePath("/admin/pages");
  redirect("/admin/pages");
}

export async function deletePage(id: string) {
  await prisma.page.delete({ where: { id } });
  revalidatePath("/admin/pages");
}
