import "server-only";
import { saveUploadedFile } from "@/lib/storage";

/**
 * フォームの画像項目を解決する。新規ファイルが送られていればR2へアップロードし、
 * なければ `${field}Url` 隠しフィールド(メディアライブラリから選択されたURL)を使う。
 * どちらも無ければ undefined を返す(編集フォームでは「変更なし」を意味する)。
 */
export async function resolveImageField(
  formData: FormData,
  field: string,
  subdir: string,
  usageType?: "article" | "setting"
): Promise<string | undefined> {
  const file = formData.get(field);
  if (file instanceof File && file.size > 0) {
    return saveUploadedFile(file, subdir, usageType);
  }
  const libraryUrl = formData.get(`${field}Url`);
  if (typeof libraryUrl === "string" && libraryUrl.trim()) {
    return libraryUrl.trim();
  }
  return undefined;
}
