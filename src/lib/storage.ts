import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/**
 * Saves an uploaded file to the local filesystem under public/uploads.
 * Swap this implementation to target S3/Blob storage later without
 * touching call sites — they only depend on the returned public URL.
 */
export async function saveUploadedFile(file: File, subdir: string): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name) || guessExtension(file.type);
  const filename = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return `/uploads/${subdir}/${filename}`;
}

function guessExtension(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/jpeg":
    default:
      return ".jpg";
  }
}
