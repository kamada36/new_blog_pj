import "server-only";
import { uploadFileToR2 } from "@/lib/r2";

/**
 * アップロードされたファイルをCloudflare R2に保存し、公開URLを返す。
 */
export async function saveUploadedFile(file: File, subdir: string): Promise<string> {
  const { url } = await uploadFileToR2(file, subdir);
  return url;
}
