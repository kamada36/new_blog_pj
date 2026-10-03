import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * 記事の本文・アイキャッチが参照している旧WordPressの画像を、R2へコピーする。
 *
 * 取り込みスクリプトは画像URLを新ドメイン(media.resilient-cer.com)へ書き換えるだけで、画像の実体は
 * 事前に別途R2へ移してあることを前提にしている。移行作業の後に現行サイトで追加された記事の画像は
 * R2に無いため、そのまま取り込むと画像が404になる。この関数が、R2に無い画像だけを旧サイトから取得して置く。
 * 既にR2にある画像は触らない(上書きしない)。
 */
export type MirrorMediaOptions = {
  oldDomain: string;
  oldPathPrefix: string;
  newPathPrefix: string;
  texts: (string | null | undefined)[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let client: S3Client | null = null;
function getClient(): { s3: S3Client; bucket: string } {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error("画像をR2へコピーするには R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME が必要です。");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return { s3: client, bucket: R2_BUCKET_NAME };
}

export async function mirrorWpMedia(options: MirrorMediaOptions) {
  const domain = escapeRegExp(options.oldDomain.replace(/^www\./i, ""));
  const prefix = escapeRegExp(options.oldPathPrefix);
  const pattern = new RegExp(`(?:https?:)?//(?:www\\.)?${domain}${prefix}/([^\\s"'<>)\\]?#]+)`, "gi");

  const relPaths = new Set<string>();
  for (const text of options.texts) {
    if (!text) continue;
    for (const match of text.matchAll(pattern)) relPaths.add(match[1]);
  }

  const result = { copied: 0, existed: 0, failed: [] as string[] };
  if (relPaths.size === 0) return result;
  const { s3, bucket } = getClient();
  const keyPrefix = options.newPathPrefix.replace(/^\/+|\/+$/g, "");

  for (const rel of relPaths) {
    const decodedRel = decodeURIComponent(rel);
    const key = keyPrefix ? `${keyPrefix}/${decodedRel}` : decodedRel;
    try {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        result.existed += 1;
        continue;
      } catch {
        // 無ければコピーする
      }
      const sourceUrl = `https://${options.oldDomain.replace(/^www\./i, "")}${options.oldPathPrefix}/${rel}`;
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`取得に失敗 (HTTP ${res.status})`);
      const body = Buffer.from(await res.arrayBuffer());
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: res.headers.get("content-type") ?? "application/octet-stream",
        })
      );
      result.copied += 1;
      console.log(`    画像をR2へコピー: ${key} (${body.byteLength} bytes)`);
    } catch (error) {
      result.failed.push(`${key}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return result;
}
