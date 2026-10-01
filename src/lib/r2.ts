import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import path from "path";

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2の接続情報が設定されていません。.envに R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY を設定してください。"
    );
  }

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function getBucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME が設定されていません。");
  return bucket;
}

function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) throw new Error("R2_PUBLIC_URL が設定されていません。");
  return `${base.replace(/\/+$/, "")}/${key}`;
}

function guessExtension(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/svg+xml":
      return ".svg";
    case "image/jpeg":
    default:
      return ".jpg";
  }
}

export type UploadedObject = {
  key: string;
  url: string;
  size: number;
  mimeType: string;
};

/**
 * ファイルをCloudflare R2にアップロードし、オブジェクトキーと公開URLを返す。
 */
export async function uploadFileToR2(file: File, subdir: string): Promise<UploadedObject> {
  const ext = path.extname(file.name) || guessExtension(file.type);
  const key = `${subdir}/${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return { key, url: getPublicUrl(key), size: buffer.byteLength, mimeType };
}

export async function deleteFileFromR2(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
}
