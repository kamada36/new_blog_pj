"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { uploadFileToR2, deleteFileFromR2 } from "@/lib/r2";

export type MediaItem = {
  id: string;
  url: string;
  filename: string;
  altText: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

function redirectWithError(message: string) {
  redirect(`/admin/media?error=${encodeURIComponent(message)}`);
}

/**
 * メディア一覧を取得する。記事編集画面のメディア選択モーダルからも
 * クライアントコンポーネント経由で直接呼び出される。
 */
export async function listMedia(): Promise<MediaItem[]> {
  const user = await getSessionUser();
  if (!user) return [];

  const items = await prisma.media.findMany({ orderBy: { createdAt: "desc" } });
  return items.map((item) => ({
    id: item.id,
    url: item.url,
    filename: item.filename,
    altText: item.altText,
    mimeType: item.mimeType,
    size: item.size,
    createdAt: item.createdAt.toISOString(),
  }));
}

export async function uploadMedia(formData: FormData) {
  const user = await getSessionUser();
  if (!user) {
    redirectWithError("セッションが切れました。再度ログインしてください。");
    return;
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    redirectWithError("画像ファイルを選択してください。");
    return;
  }

  for (const file of imageFiles) {
    const { key, url, size, mimeType } = await uploadFileToR2(file, "media");
    await prisma.media.create({
      data: { key, url, filename: file.name, mimeType, size },
    });
  }

  revalidatePath("/admin/media");
}

const updateSchema = z.object({
  filename: z.string().trim().min(1, "ファイル名を入力してください").max(200),
  altText: z.string().trim().max(300).optional().default(""),
});

export async function updateMedia(id: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;

  const parsed = updateSchema.safeParse({
    filename: formData.get("filename"),
    altText: formData.get("altText") ?? "",
  });
  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "入力内容をご確認ください。");
    return;
  }

  await prisma.media.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/media");
}

export async function deleteMedia(id: string) {
  const user = await getSessionUser();
  if (!user) return;

  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) return;

  await prisma.media.delete({ where: { id } });
  try {
    await deleteFileFromR2(media.key);
  } catch {
    // R2側の削除に失敗してもDBレコードは消えている。孤児オブジェクトはそのままにする。
  }
  revalidatePath("/admin/media");
}
