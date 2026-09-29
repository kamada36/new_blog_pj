/**
 * WordPress → Supabase(Postgres/Prisma) 記事移行スクリプト。
 *
 * WP REST API (`/wp-json/wp/v2/posts?status=any&_embed`) から下書き・予約投稿・非公開を含む
 * 全記事を取得し、本文/アイキャッチ中の画像URLを新ドメイン(media.resilient-cer.com)へ置換した上で
 * Article テーブルへ upsert する。`wpId` を突き合わせキーにしているため、何度実行しても
 * 重複作成せず内容が最新化される(冪等)。
 *
 * 実行方法・環境変数は README または .env.example を参照。
 *
 *   npm run import:wordpress            # 実際にDBへ書き込む
 *   WP_IMPORT_DRY_RUN=true npm run import:wordpress   # 取得・変換内容の確認のみ(DB書き込みなし)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { createMediaUrlRewriter } from "./lib/media-url";
import { stripHtmlToPlainText, decodeHtmlEntities } from "./lib/html-text";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。.env を確認してください。`);
  }
  return value;
}

const WP_URL = requireEnv("WP_URL").replace(/\/+$/, "");
const WP_USER = requireEnv("WP_USER");
const WP_APP_PASSWORD = requireEnv("WP_APP_PASSWORD");

const NEW_MEDIA_BASE_URL = process.env.NEW_MEDIA_BASE_URL ?? "https://media.resilient-cer.com";
const WP_OLD_MEDIA_DOMAIN = process.env.WP_OLD_MEDIA_DOMAIN ?? new URL(WP_URL).hostname;
const WP_OLD_MEDIA_PATH_PREFIX = process.env.WP_OLD_MEDIA_PATH_PREFIX ?? "/wp-content/uploads";
const NEW_MEDIA_PATH_PREFIX = process.env.NEW_MEDIA_PATH_PREFIX ?? "/uploads";
const PER_PAGE = Number(process.env.WP_IMPORT_PER_PAGE ?? 50);
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

type WpTerm = { id: number; name: string; slug: string; taxonomy: string };

type WpPost = {
  id: number;
  date_gmt: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
    "wp:term"?: WpTerm[][];
  };
};

async function fetchAllPosts(): Promise<WpPost[]> {
  const authHeader = "Basic " + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");
  const posts: WpPost[] = [];
  let page = 1;

  while (true) {
    const url = new URL("/wp-json/wp/v2/posts", WP_URL);
    url.searchParams.set("status", "any");
    url.searchParams.set("_embed", "1");
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("orderby", "id");
    url.searchParams.set("order", "asc");

    const res = await fetch(url, { headers: { Authorization: authHeader } });

    if (!res.ok) {
      // WPは最終ページを超えると400 rest_post_invalid_page_numberを返す。
      if (res.status === 400 && page > 1) break;
      throw new Error(`WP REST APIの取得に失敗しました: ${res.status} ${res.statusText} (page ${page})`);
    }

    const batch = (await res.json()) as WpPost[];
    posts.push(...batch);

    const totalPages = Number(res.headers.get("X-WP-TotalPages") ?? page);
    console.log(`  取得中... page ${page}/${totalPages} (${batch.length}件)`);
    if (batch.length === 0 || page >= totalPages) break;
    page += 1;
  }

  return posts;
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

function computePublishedAt(post: WpPost): Date | null {
  // publish/private/future(予約投稿)は日付に意味があるため保持する。
  // future はこのアプリに予約公開のスケジューラが無いため status は draft 扱いになるが、
  // 日付情報自体は失わずに保持しておく(手動でpublishedに切り替えた際に活用できる)。
  if (["publish", "private", "future"].includes(post.status)) {
    return new Date(`${post.date_gmt}Z`);
  }
  return null;
}

async function getAdminUserId(): Promise<string> {
  // このアプリは単一管理者を前提とした設計(prisma/schema.prismaのコメント参照)のため、
  // WP側の投稿者名に関わらず、既存の管理者ユーザーに紐付ける。
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

/**
 * WPのカテゴリー一覧から、このアプリのカテゴリー(記事1件につき1つ)を解決する。
 * - slugが一致する既存カテゴリーがあればそれを使う
 * - 一致しなければ、WP側の一番目のカテゴリーをそのまま新規作成する
 * - WP側にカテゴリーが無ければ「未分類」にフォールバックする
 * このアプリのArticleは単一カテゴリー設計のため、2つ目以降のWPカテゴリーは取り込まない。
 */
async function resolveCategoryId(wpCategories: WpTerm[], fallbackCategoryId: string): Promise<string> {
  if (wpCategories.length === 0) return fallbackCategoryId;

  const primary = wpCategories[0];
  const category = await prisma.category.upsert({
    where: { slug: primary.slug },
    update: {},
    create: { name: decodeHtmlEntities(primary.name), slug: primary.slug },
  });
  return category.id;
}

function extractTerms(post: WpPost, taxonomy: string): WpTerm[] {
  const groups = post._embedded?.["wp:term"] ?? [];
  return groups.flat().filter((term) => term.taxonomy === taxonomy);
}

async function run() {
  console.log(`WordPress記事の取得を開始します: ${WP_URL}`);
  if (DRY_RUN) console.log("(DRY RUN: DBへの書き込みは行いません)");

  const posts = await fetchAllPosts();
  console.log(`取得完了: ${posts.length}件`);

  const adminUserId = DRY_RUN ? null : await getAdminUserId();
  const fallbackCategoryId = DRY_RUN ? null : await getFallbackCategoryId();

  const summary = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const nhm = new NodeHtmlMarkdown({ useLinkReferenceDefinitions: false });

  for (const [index, post] of posts.entries()) {
    const label = `[${index + 1}/${posts.length}] wpId=${post.id} slug=${post.slug} status=${post.status}`;
    try {
      const title = stripHtmlToPlainText(post.title.rendered);
      const excerpt = stripHtmlToPlainText(post.excerpt.rendered).slice(0, 400);
      const contentHtml = rewriteMediaUrls(post.content.rendered);
      const contentMarkdown = nhm.translate(contentHtml).trim() || "(本文なし)";

      const featuredMediaUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
      const coverImageUrl = featuredMediaUrl ? rewriteMediaUrls(featuredMediaUrl) : null;

      const status = mapStatus(post.status);
      const publishedAt = computePublishedAt(post);
      const wpTags = extractTerms(post, "post_tag");
      const metaKeywords = wpTags.map((t) => decodeHtmlEntities(t.name)).join(", ");

      if (DRY_RUN) {
        console.log(`${label} -> title="${title}" status=${status} cover=${coverImageUrl ?? "-"}`);
        continue;
      }

      // slugが既存の別記事(WP由来でないもの含む)と衝突する場合は上書きせずスキップする。
      const slugConflict = await prisma.article.findFirst({
        where: { slug: post.slug, wpId: { not: post.id } },
        select: { id: true },
      });
      if (slugConflict) {
        console.warn(`${label} -> スラッグ重複のためスキップしました (既存記事ID: ${slugConflict.id})`);
        summary.skipped += 1;
        continue;
      }

      const wpCategories = extractTerms(post, "category");
      const categoryId = await resolveCategoryId(wpCategories, fallbackCategoryId!);
      const tagConnectOrCreate = wpTags.map((t) => ({
        where: { slug: t.slug },
        create: { name: decodeHtmlEntities(t.name), slug: t.slug },
      }));

      const baseData = {
        title,
        slug: post.slug,
        excerpt,
        contentMarkdown,
        coverImageUrl,
        status,
        publishedAt,
        metaTitle: title,
        metaDescription: excerpt.slice(0, 160),
        metaKeywords,
        categoryId,
        createdAt: new Date(`${post.date_gmt}Z`),
        updatedAt: new Date(`${post.modified_gmt}Z`),
      };

      const existing = await prisma.article.findUnique({ where: { wpId: post.id }, select: { id: true } });

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
            wpId: post.id,
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
