import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

export function getPublicUrl(key: string): string {
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
 * WordPress時代と同様、年/月のフォルダに分けて保存する(例: media/2026/10/xxxx.jpg)。
 */
export async function uploadFileToR2(file: File, subdir: string): Promise<UploadedObject> {
  const ext = path.extname(file.name) || guessExtension(file.type);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const key = `${subdir}/${year}/${month}/${randomUUID()}${ext}`;
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

export type R2Object = {
  key: string;
  size: number;
  lastModified?: Date;
};

/**
 * バケット内の全オブジェクトを一覧する(1000件ずつページネーション)。
 * 既にR2へ直接アップロードされている画像(WordPress移行分等)をMediaテーブルへ
 * 取り込む際の一覧取得に使う。
 */
export async function listAllR2Objects(): Promise<R2Object[]> {
  const client = getClient();
  const bucket = getBucketName();
  const objects: R2Object[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken, MaxKeys: 1000 })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && typeof obj.Size === "number") {
        objects.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}
