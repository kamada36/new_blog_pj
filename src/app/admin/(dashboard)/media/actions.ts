"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { deleteFileFromR2, listAllR2Objects, getPublicUrl } from "@/lib/r2";
import { saveUploadedFile } from "@/lib/storage";

export type MediaItem = {
  id: string;
  url: string;
  filename: string;
  altText: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

/** メディアライブラリ一覧画面用。使用状況(どの記事で使われているか)を含む。 */
export type MediaRow = MediaItem & {
  isUsed: boolean;
  usedBy: { id: string; slug: string; title: string }[];
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
    await saveUploadedFile(file, "media");
  }

  revalidatePath("/admin/media");
}

// WordPress移行スクリプトがR2直下の年フォルダ(例: 2024/06/xxx.jpg)へ保存した画像。
// アプリ自身のアップロードは"media/"等の非数字プレフィックスを使うため、このパターンとは重ならない。
const WP_MIGRATED_PREFIX = /^\d{4}\//;
// WordPressが自動生成するリサイズ済み派生画像("-幅x高さ.拡張子"で終わるもの)。元画像のみ取り込む。
const WP_SIZE_VARIANT = /-\d{1,5}x\d{1,5}\.(jpe?g|png|gif|webp)$/i;
const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|svg)$/i;

function guessMimeTypeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

/**
 * WordPress移行時にR2へ直接保存された画像(DB未登録分)をMediaテーブルへ取り込む。
 * 既に登録済みのキーはスキップするため、何度実行しても安全。
 */
export async function syncMediaFromR2() {
  const user = await getSessionUser();
  if (!user) {
    redirectWithError("セッションが切れました。再度ログインしてください。");
    return;
  }

  const [objects, existing] = await Promise.all([
    listAllR2Objects(),
    prisma.media.findMany({ select: { key: true } }),
  ]);
  const existingKeys = new Set(existing.map((m) => m.key));

  const candidates = objects.filter(
    (obj) =>
      WP_MIGRATED_PREFIX.test(obj.key) &&
      IMAGE_EXTENSION.test(obj.key) &&
      !WP_SIZE_VARIANT.test(obj.key) &&
      !existingKeys.has(obj.key)
  );

  if (candidates.length > 0) {
    await prisma.media.createMany({
      data: candidates.map((obj) => ({
        key: obj.key,
        url: getPublicUrl(obj.key),
        filename: obj.key.split("/").pop() ?? obj.key,
        mimeType: guessMimeTypeFromKey(obj.key),
        size: obj.size,
        ...(obj.lastModified ? { createdAt: obj.lastModified } : {}),
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/admin/media");
  redirect(`/admin/media?imported=${candidates.length}`);
}

const updateSchema = z.object({
  filename: z.string().trim().min(1, "ファイル名を入力してください").max(200),
  altText: z.string().trim().max(300).optional().default(""),
});

export type UpdateMediaResult = { status: "ok" } | { status: "error"; message: string };

/**
 * メディア詳細モーダルから呼び出される。一覧側には編集UIを置かないため、
 * 呼び出し元はこのモーダルのみ(ネイティブなform送信ではなくJSから直接呼ばれる)。
 */
export async function updateMedia(id: string, formData: FormData): Promise<UpdateMediaResult> {
  const user = await getSessionUser();
  if (!user) return { status: "error", message: "セッションが切れました。再度ログインしてください。" };

  const parsed = updateSchema.safeParse({
    filename: formData.get("filename"),
    altText: formData.get("altText") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "入力内容をご確認ください。" };
  }

  await prisma.media.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/media");
  return { status: "ok" };
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

export async function bulkDeleteMedia(ids: string[]) {
  const user = await getSessionUser();
  if (!user || ids.length === 0) return;

  const items = await prisma.media.findMany({ where: { id: { in: ids } } });
  await prisma.media.deleteMany({ where: { id: { in: ids } } });
  await Promise.allSettled(items.map((item) => deleteFileFromR2(item.key)));
  revalidatePath("/admin/media");
}
