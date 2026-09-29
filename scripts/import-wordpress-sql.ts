/**
 * WordPress(mysqldumpのSQLファイル) → Supabase(Postgres/Prisma) 記事移行スクリプト。
 *
 * WP REST APIが使えない(または使わない)場合向けに、phpMyAdmin/mysqldumpが出力した
 * フルダンプ(.sql)を直接パースして記事を取り込む版。変換ロジック(画像URL置換・
 * HTML→Markdown・ステータスマッピング・wpIdによるupsert)は scripts/import-wordpress.ts
 * (REST API版)と共通の考え方。
 *
 * 対応テーブル: wp_posts / wp_postmeta(_thumbnail_id) / wp_terms / wp_term_taxonomy /
 * wp_term_relationships。それ以外(コメント・ユーザー・設定など)は取り込まない。
 *
 * 除外するpost_type/post_status:
 * - post_type: "post"以外(page, attachment, revision, nav_menu_itemなど)は対象外。
 *   attachmentのみ、アイキャッチ画像URLの解決に内部的に使う。
 * - post_status: "trash"(削除済み)と"auto-draft"(WPが自動生成する空の下書き)は
 *   実質ゴミデータのため対象外(要件通り、不要と判断できるWP固有データを除外)。
 *
 * 実行方法:
 *   npm run import:wordpress-sql
 *   WP_IMPORT_DRY_RUN=true npm run import:wordpress-sql   # DB書き込みなしで確認のみ
 *
 * 必要な環境変数は .env.example の「WordPress記事移行」セクションを参照
 * (WP_URL / WP_USER / WP_APP_PASSWORD はこちらのSQL版では不要)。
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { extractTableRows, type SqlRow } from "./lib/sql-dump";
import { createMediaUrlRewriter } from "./lib/media-url";
import { stripHtmlToPlainText, decodeHtmlEntities } from "./lib/html-text";
import { transformCocoonBalloons } from "./lib/cocoon-blocks";

const SQL_FILE_PATH = process.env.WP_SQL_FILE ?? "scripts/data/wp-export.sql";
const OLD_SITE_URL = process.env.WP_URL ?? "https://resilient-cer.com";

const NEW_MEDIA_BASE_URL = process.env.NEW_MEDIA_BASE_URL ?? "https://media.resilient-cer.com";
const WP_OLD_MEDIA_DOMAIN = process.env.WP_OLD_MEDIA_DOMAIN ?? new URL(OLD_SITE_URL).hostname;
const WP_OLD_MEDIA_PATH_PREFIX = process.env.WP_OLD_MEDIA_PATH_PREFIX ?? "/wp-content/uploads";
const NEW_MEDIA_PATH_PREFIX = process.env.NEW_MEDIA_PATH_PREFIX ?? "/uploads";
const DRY_RUN = process.env.WP_IMPORT_DRY_RUN === "true";
const FALLBACK_CATEGORY_SLUG = "uncategorized";

const rewriteMediaUrls = createMediaUrlRewriter({
  oldDomain: WP_OLD_MEDIA_DOMAIN,
  newBaseUrl: NEW_MEDIA_BASE_URL,
  oldPathPrefix: WP_OLD_MEDIA_PATH_PREFIX,
  newPathPrefix: NEW_MEDIA_PATH_PREFIX,
});

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function str(row: SqlRow, key: string): string {
  const v = row[key];
  return v === null || v === undefined ? "" : String(v);
}

function num(row: SqlRow, key: string): number {
  return Number(row[key]);
}

function mapStatus(wpStatus: string): "draft" | "published" | "private" {
  switch (wpStatus) {
    case "publish":
      return "published";
    case "private":
      return "private";
    case "draft":
    case "pending":
    case "future":
      return "draft";
    default:
      console.warn(`  未知のstatus "${wpStatus}" を draft として扱います。`);
      return "draft";
  }
}

/**
 * WPの日時文字列をDateへ変換する。一度も確定保存されていない下書きは
 * post_date_gmt/post_modified_gmtが "0000-00-00 00:00:00" (MySQLのゼロ日付)のままの
 * ことがあり、そのままDateにすると invalid date になるため null を返す。
 */
function parseWpDate(gmtValue: string): Date | null {
  if (!gmtValue || gmtValue.startsWith("0000-00-00")) return null;
  const d = new Date(`${gmtValue}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computePublishedAt(post: SqlRow): Date | null {
  const status = str(post, "post_status");
  // publish/private/future(予約投稿)は日付に意味があるため保持する。
  if (["publish", "private", "future"].includes(status)) {
    return parseWpDate(str(post, "post_date_gmt"));
  }
  return null;
}

async function getAdminUserId(): Promise<string> {
  const admin = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin) {
    throw new Error("管理者ユーザーが存在しません。先に `npx prisma db seed` を実行してください。");
  }
  return admin.id;
}

async function getFallbackCategoryId(): Promise<string> {
  const category = await prisma.category.upsert({
    where: { slug: FALLBACK_CATEGORY_SLUG },
    update: {},
    create: { name: "未分類", slug: FALLBACK_CATEGORY_SLUG, order: 999 },
  });
  return category.id;
}

async function resolveCategoryId(name: string, slug: string, fallbackCategoryId: string): Promise<string> {
  if (!slug) return fallbackCategoryId;
  const category = await prisma.category.upsert({
    where: { slug },
    update: {},
    create: { name: decodeHtmlEntities(name), slug },
  });
  return category.id;
}

async function run() {
  const filePath = path.resolve(SQL_FILE_PATH);
  console.log(`SQLダンプを読み込みます: ${filePath}`);
  if (DRY_RUN) console.log("(DRY RUN: DBへの書き込みは行いません)");

  const sql = fs.readFileSync(filePath, "utf-8");

  console.log("テーブルをパース中...");
  const allPosts = extractTableRows(sql, "wp_posts");
  const postmeta = extractTableRows(sql, "wp_postmeta");
  const terms = extractTableRows(sql, "wp_terms");
  const termTaxonomy = extractTableRows(sql, "wp_term_taxonomy");
  const termRelationships = extractTableRows(sql, "wp_term_relationships");

  // --- 補助インデックスの構築 ---
  const attachmentById = new Map<number, SqlRow>();
  for (const p of allPosts) {
    if (str(p, "post_type") === "attachment") attachmentById.set(num(p, "ID"), p);
  }

  const thumbnailIdByPostId = new Map<number, number>();
  for (const m of postmeta) {
    if (str(m, "meta_key") === "_thumbnail_id") {
      thumbnailIdByPostId.set(num(m, "post_id"), Number(m.meta_value));
    }
  }

  const termById = new Map<number, SqlRow>();
  for (const t of terms) termById.set(num(t, "term_id"), t);

  // term_taxonomy_id -> { taxonomy, term }
  const taxonomyById = new Map<number, { taxonomy: string; term: SqlRow }>();
  for (const tt of termTaxonomy) {
    const term = termById.get(num(tt, "term_id"));
    if (term) taxonomyById.set(num(tt, "term_taxonomy_id"), { taxonomy: str(tt, "taxonomy"), term });
  }

  // post_id -> term_taxonomy_id[]
  const taxonomyIdsByPostId = new Map<number, number[]>();
  for (const rel of termRelationships) {
    const postId = num(rel, "object_id");
    const list = taxonomyIdsByPostId.get(postId) ?? [];
    list.push(num(rel, "term_taxonomy_id"));
    taxonomyIdsByPostId.set(postId, list);
  }

  function getTerms(postId: number, taxonomy: "category" | "post_tag"): SqlRow[] {
    const ttIds = taxonomyIdsByPostId.get(postId) ?? [];
    const result: SqlRow[] = [];
    for (const ttId of ttIds) {
      const entry = taxonomyById.get(ttId);
      if (entry && entry.taxonomy === taxonomy) result.push(entry.term);
    }
    return result;
  }

  function resolveFeaturedImageUrl(postId: number): string | null {
    const attachmentId = thumbnailIdByPostId.get(postId);
    if (!attachmentId) return null;
    const attachment = attachmentById.get(attachmentId);
    return attachment ? str(attachment, "guid") : null;
  }

  // --- 対象記事の絞り込み ---
  const targetPosts = allPosts.filter((p) => {
    if (str(p, "post_type") !== "post") return false;
    const status = str(p, "post_status");
    return status !== "trash" && status !== "auto-draft";
  });
  console.log(`取得完了: 全${allPosts.length}行 / 移行対象記事 ${targetPosts.length}件`);

  const adminUserId = DRY_RUN ? null : await getAdminUserId();
  const fallbackCategoryId = DRY_RUN ? null : await getFallbackCategoryId();

  const summary = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const nhm = new NodeHtmlMarkdown({ useLinkReferenceDefinitions: false });

  for (const [index, post] of targetPosts.entries()) {
    const wpId = num(post, "ID");
    const slug = str(post, "post_name");
    const status = str(post, "post_status");
    const label = `[${index + 1}/${targetPosts.length}] wpId=${wpId} slug=${slug} status=${status}`;

    try {
      const title = stripHtmlToPlainText(str(post, "post_title"));
      const excerptSource = str(post, "post_excerpt");
      const excerpt = stripHtmlToPlainText(excerptSource || str(post, "post_content")).slice(0, 400);

      const rawContent = str(post, "post_content");
      const withBalloons = transformCocoonBalloons(rawContent);
      const contentHtml = rewriteMediaUrls(withBalloons);
      const contentMarkdown = nhm.translate(contentHtml).trim() || "(本文なし)";

      const featuredMediaUrl = resolveFeaturedImageUrl(wpId);
      const coverImageUrl = featuredMediaUrl ? rewriteMediaUrls(featuredMediaUrl) : null;

      const mappedStatus = mapStatus(status);
      const publishedAt = computePublishedAt(post);
      const wpTags = getTerms(wpId, "post_tag");
      const metaKeywords = wpTags.map((t) => decodeHtmlEntities(str(t, "name"))).join(", ");

      if (DRY_RUN) {
        console.log(`${label} -> title="${title}" status=${mappedStatus} cover=${coverImageUrl ?? "-"}`);
        continue;
      }

      // post_nameが空の下書き(一度も本編集画面で保存確定されていないもの)は
      // wpIdベースの代替スラッグを発行して取り込む(要件通り、下書きも含めて残す)。
      const effectiveSlug = slug || `post-${wpId}`;

      // wpId: { not } はSQLの3値論理によりwpIdがNULLの行(手動作成記事)を除外してしまうため、
      // 明示的にORで含める。
      const slugConflict = await prisma.article.findFirst({
        where: { slug: effectiveSlug, OR: [{ wpId: null }, { wpId: { not: wpId } }] },
        select: { id: true },
      });
      if (slugConflict) {
        console.warn(`${label} -> スラッグ重複のためスキップしました (既存記事ID: ${slugConflict.id})`);
        summary.skipped += 1;
        continue;
      }

      const wpCategories = getTerms(wpId, "category");
      const categoryId =
        wpCategories.length > 0
          ? await resolveCategoryId(str(wpCategories[0], "name"), str(wpCategories[0], "slug"), fallbackCategoryId!)
          : fallbackCategoryId!;

      const tagConnectOrCreate = wpTags.map((t) => ({
        where: { slug: str(t, "slug") },
        create: { name: decodeHtmlEntities(str(t, "name")), slug: str(t, "slug") },
      }));

      const baseData = {
        title,
        slug: effectiveSlug,
        excerpt,
        contentMarkdown,
        coverImageUrl,
        status: mappedStatus,
        publishedAt,
        metaTitle: title,
        metaDescription: excerpt.slice(0, 160),
        metaKeywords,
        categoryId,
        createdAt:
          parseWpDate(str(post, "post_date_gmt")) ?? parseWpDate(str(post, "post_modified_gmt")) ?? new Date(),
        updatedAt:
          parseWpDate(str(post, "post_modified_gmt")) ?? parseWpDate(str(post, "post_date_gmt")) ?? new Date(),
      };

      const existing = await prisma.article.findUnique({ where: { wpId }, select: { id: true } });

      if (existing) {
        await prisma.article.update({
          where: { id: existing.id },
          data: { ...baseData, tags: { set: [], connectOrCreate: tagConnectOrCreate } },
        });
        summary.updated += 1;
        console.log(`${label} -> 更新`);
      } else {
        await prisma.article.create({
          data: {
            ...baseData,
            wpId,
            authorId: adminUserId!,
            tags: { connectOrCreate: tagConnectOrCreate },
          },
        });
        summary.created += 1;
        console.log(`${label} -> 新規作成`);
      }
    } catch (error) {
      summary.failed += 1;
      console.error(`${label} -> 失敗:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("\n=== 移行結果 ===");
  console.log(`新規作成: ${summary.created}件 / 更新: ${summary.updated}件 / スキップ: ${summary.skipped}件 / 失敗: ${summary.failed}件`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
