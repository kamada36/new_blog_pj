import "server-only";
import { prisma } from "@/lib/prisma";
import { uploadFileToR2 } from "@/lib/r2";

/**
 * アップロードされたファイルをCloudflare R2に保存し、メディアライブラリにも登録したうえで
 * 公開URLを返す。呼び出し元(カバー画像・プロフィール画像・ヒーロー画像・ショートコードアイコン等)を
 * 問わず、アップロードした画像はすべて自動的にメディアライブラリの一覧に反映される。
 */
export async function saveUploadedFile(file: File, subdir: string): Promise<string> {
  const { key, url, size, mimeType } = await uploadFileToR2(file, subdir);
  await prisma.media.create({ data: { key, url, filename: file.name, mimeType, size } });
  return url;
}
