"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/storage";
import { slugify } from "@/lib/slug";

const articleSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "タイトルを入力してください").max(200),
  slug: z
    .string()
    .trim()
    .min(1, "スラッグを入力してください")
    .regex(/^[^\s/?#]+$/, "スラッグに空白や / ? # は使用できません"),
  excerpt: z.string().trim().max(400).optional().default(""),
  contentMarkdown: z.string().min(1, "本文を入力してください"),
  categoryId: z.string().min(1, "カテゴリーを選択してください"),
  tagIds: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "private"]),
  metaTitle: z.string().trim().max(200).optional().default(""),
  metaDescription: z.string().trim().max(300).optional().default(""),
  metaKeywords: z.string().trim().max(300).optional().default(""),
});

export type ArticleFormState = {
  status: "idle" | "error";
  message?: string;
};

export async function saveArticle(_prevState: ArticleFormState, formData: FormData): Promise<ArticleFormState> {
  const author = await getSessionUser();
  if (!author) {
    return { status: "error", message: "セッションが切れました。再度ログインしてください。" };
  }

  const rawTitle = String(formData.get("title") ?? "");
  const rawSlug = String(formData.get("slug") ?? "") || slugify(rawTitle);

  const parsed = articleSchema.safeParse({
    id: formData.get("id") || undefined,
    title: rawTitle,
    slug: rawSlug,
    excerpt: formData.get("excerpt") ?? "",
    contentMarkdown: formData.get("contentMarkdown") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    tagIds: formData.getAll("tagIds").map(String),
    status: formData.get("status") ?? "draft",
    metaTitle: formData.get("metaTitle") ?? "",
    metaDescription: formData.get("metaDescription") ?? "",
    metaKeywords: formData.get("metaKeywords") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "入力内容をご確認ください。" };
  }

  const data = parsed.data;

  const duplicate = await prisma.article.findFirst({
    where: { slug: data.slug, NOT: data.id ? { id: data.id } : undefined },
  });
  if (duplicate) {
    return { status: "error", message: "このスラッグは既に使用されています。" };
  }

  let coverImageUrl: string | undefined;
  const coverImageFile = formData.get("coverImage");
  if (coverImageFile instanceof File && coverImageFile.size > 0) {
    coverImageUrl = await saveUploadedFile(coverImageFile, "articles");
  }

  const existing = data.id ? await prisma.article.findUnique({ where: { id: data.id } }) : null;
  const publishedAt =
    data.status === "published" ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null;

  const payload = {
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt,
    contentMarkdown: data.contentMarkdown,
    status: data.status,
    publishedAt,
    metaTitle: data.metaTitle,
    metaDescription: data.metaDescription,
    metaKeywords: data.metaKeywords,
    categoryId: data.categoryId,
    ...(coverImageUrl ? { coverImageUrl } : {}),
  };
  const tagRefs = data.tagIds.map((id) => ({ id }));

  if (existing) {
    await prisma.article.update({
      where: { id: existing.id },
      data: { ...payload, tags: { set: tagRefs } },
    });
  } else {
    await prisma.article.create({
      data: { ...payload, authorId: author.id, tags: { connect: tagRefs } },
    });
  }

  revalidatePath("/");
  revalidatePath(`/articles/${data.slug}`);
  redirect("/admin/articles");
}

export async function deleteArticle(id: string) {
  const author = await getSessionUser();
  if (!author) return;

  await prisma.article.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/articles");
}
