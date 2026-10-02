import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { DEFAULT_RESIDENT, type CategoryOption, type ResidentPersona } from "./guidelines";

// AI生成・AIリライトの結果をSupabase(Postgres/Prisma)へ保存するデータ層。
// 元ツールがWordPress REST APIへ送っていた内容(タイトル・本文・抜粋・タグ・アイキャッチ・ステータス)を、
// このブログの Article / Tag / Category テーブルの形に対応づけている。

// ─── マスターデータの読み出し(プロンプト用) ──────────────────────────────

export async function getCategoryOptions(): Promise<CategoryOption[]> {
  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { name: true, slug: true, description: true },
  });
  return categories;
}

/** hukidasi2のキャラクター(サイト設定の「サイトの住人」)。未設定ならデフォルトを使う。 */
export async function getResidentPersona(): Promise<ResidentPersona> {
  const setting = await prisma.siteSetting.findFirst({ select: { residentName: true, residentBio: true } });
  return setting
    ? { name: setting.residentName || DEFAULT_RESIDENT.name, bio: setting.residentBio || DEFAULT_RESIDENT.bio }
    : DEFAULT_RESIDENT;
}

// ─── スラッグ・タグ・カテゴリーの解決 ─────────────────────────────────────

/** AIが返したスラッグを、このブログのURLに使える形(英小文字・数字・ハイフン)へ整える。 */
export function sanitizeSlug(raw: string | undefined | null): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `article-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 既存記事と重複しないスラッグにする(重複時は -2, -3 … を付ける)。 */
export async function ensureUniqueSlug(base: string, excludeArticleId?: string): Promise<string> {
  const root = sanitizeSlug(base) || timestampSlug();
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const clash = await prisma.article.findFirst({
      where: { slug: candidate, ...(excludeArticleId ? { NOT: { id: excludeArticleId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${root}-${Date.now()}`;
}

const MAX_TAGS = 10;

export function normalizeTagNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.replace(/^[#＃]+/, "").trim();
    if (!name || name.length > 30) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

/** タグ名を既存タグのIDへ解決する。無いタグは新規作成する(スラッグはタグ管理画面と同じ slugify)。 */
async function resolveTagIds(names: string[]): Promise<string[]> {
  const tagNames = normalizeTagNames(names);
  if (tagNames.length === 0) return [];

  const existing = await prisma.tag.findMany({ where: { name: { in: tagNames, mode: "insensitive" } } });
  const byName = new Map(existing.map((tag) => [tag.name.toLowerCase(), tag.id]));

  const ids: string[] = [];
  for (const name of tagNames) {
    const found = byName.get(name.toLowerCase());
    if (found) {
      ids.push(found);
      continue;
    }
    const base = slugify(name).slice(0, 40) || "tag";
    let slug = base;
    for (let n = 2; await prisma.tag.findUnique({ where: { slug }, select: { id: true } }); n++) {
      slug = `${base.slice(0, 36)}-${n}`;
    }
    const created = await prisma.tag.create({ data: { name, slug } });
    ids.push(created.id);
  }
  return ids;
}

/** カテゴリーIDの指定 → カテゴリーslug(AIの提案) → 先頭のカテゴリー の順で解決する。 */
export async function resolveCategoryId(preferredId?: string | null, slug?: string | null): Promise<string> {
  if (preferredId) {
    const byId = await prisma.category.findUnique({ where: { id: preferredId }, select: { id: true } });
    if (byId) return byId.id;
  }
  if (slug) {
    const bySlug = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    if (bySlug) return bySlug.id;
  }
  const first = await prisma.category.findFirst({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!first) throw new Error("カテゴリーが1件も登録されていません。先にカテゴリーを作成してください。");
  return first.id;
}

// ─── 生成記事の保存(upsert) ──────────────────────────────────────────────

export interface ArticleDraftInput {
  title: string;
  /** 新規作成時のみ使う。既存記事の更新ではURLを変えないため無視される。 */
  slug?: string;
  excerpt: string;
  contentMarkdown: string;
  categoryId: string;
  tagNames: string[];
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  /** 指定時のみ更新する(undefined なら既存のアイキャッチを変えない) */
  coverImageUrl?: string | null;
}

export interface SavedArticle {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
}

/**
 * 生成した記事を保存する。articleIdが指定され、その記事が存在すれば更新、無ければ新規作成(=upsert)。
 * 新規作成は必ず下書き(draft)。更新では、スラッグ・公開状態・公開日時には触れない
 * (公開済みのURLを壊さない、手動で変えたステータスを巻き戻さないため)。
 */
export async function upsertArticleDraft(
  articleId: string | undefined,
  authorId: string,
  input: ArticleDraftInput
): Promise<SavedArticle> {
  const tagIds = await resolveTagIds(input.tagNames);
  const tagRefs = tagIds.map((id) => ({ id }));

  const common = {
    title: input.title,
    excerpt: input.excerpt.slice(0, 400),
    contentMarkdown: input.contentMarkdown,
    categoryId: input.categoryId,
    metaTitle: input.metaTitle.slice(0, 200),
    metaDescription: input.metaDescription.slice(0, 300),
    metaKeywords: input.metaKeywords.slice(0, 300),
    ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
  };

  const existing = articleId
    ? await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } })
    : null;

  const saved = existing
    ? await prisma.article.update({
        where: { id: existing.id },
        data: { ...common, tags: { set: tagRefs } },
        select: { id: true, slug: true, title: true, categoryId: true },
      })
    : await prisma.article.create({
        data: {
          ...common,
          slug: await ensureUniqueSlug(input.slug ?? slugify(input.title)),
          status: "draft",
          authorId,
          tags: { connect: tagRefs },
        },
        select: { id: true, slug: true, title: true, categoryId: true },
      });

  // 公開済みの記事を追加指示で更新した場合に、公開ページへ反映する
  revalidatePath("/");
  revalidatePath(`/articles/${saved.slug}`);
  revalidatePath("/admin/articles");
  return saved;
}

export async function loadArticleForEditor(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      contentMarkdown: true,
      categoryId: true,
      status: true,
      coverImageUrl: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
      tags: { select: { name: true } },
    },
  });
}

// ─── リライト: バックアップ・適用・復元・履歴 ─────────────────────────────

export type PublishChoice = "keep" | "draft" | "published";

/**
 * 最初のリライト実行時にだけ、元の本文・ステータスを退避する(連続リライトしても最初の原文を保つ)。
 * 今回新しくバックアップを作ったらtrue、既にあったらfalse。
 */
export async function saveRewriteBackupIfAbsent(article: {
  id: string;
  contentMarkdown: string;
  status: string;
  publishedAt: Date | null;
}): Promise<boolean> {
  const existing = await prisma.articleRewriteBackup.findUnique({
    where: { articleId: article.id },
    select: { articleId: true },
  });
  if (existing) return false;
  await prisma.articleRewriteBackup.create({
    data: {
      articleId: article.id,
      originalContent: article.contentMarkdown,
      originalStatus: article.status,
      originalPublishedAt: article.publishedAt,
    },
  });
  return true;
}

function revalidateArticlePaths(slug: string) {
  revalidatePath("/");
  revalidatePath(`/articles/${slug}`);
  revalidatePath("/admin/articles");
  revalidatePath("/admin/rewrite");
}

export async function applyRewrite(
  article: { id: string; slug: string; status: string; publishedAt: Date | null },
  contentMarkdown: string,
  publish: PublishChoice
): Promise<{ status: string }> {
  const status = publish === "keep" ? article.status : publish;
  const publishedAt =
    status === "published" ? (article.publishedAt ?? new Date()) : article.publishedAt;

  await prisma.article.update({
    where: { id: article.id },
    data: { contentMarkdown, status, publishedAt },
  });
  revalidateArticlePaths(article.slug);
  return { status };
}

/** 未確定のリライトを取り消し、バックアップの本文・ステータスへ戻す。戻せたらtrue。 */
export async function revertRewrite(articleId: string): Promise<{ title: string; slug: string } | null> {
  const backup = await prisma.articleRewriteBackup.findUnique({ where: { articleId } });
  if (!backup) return null;

  const [article] = await prisma.$transaction([
    prisma.article.update({
      where: { id: articleId },
      data: {
        contentMarkdown: backup.originalContent,
        status: backup.originalStatus,
        publishedAt: backup.originalPublishedAt,
      },
      select: { title: true, slug: true },
    }),
    prisma.articleRewriteBackup.delete({ where: { articleId } }),
  ]);
  revalidateArticlePaths(article.slug);
  return article;
}

/** リライト内容を確定する(バックアップを破棄する。以後は元に戻せない)。 */
export async function finalizeRewrite(articleId: string): Promise<void> {
  await prisma.articleRewriteBackup.deleteMany({ where: { articleId } });
  revalidatePath("/admin/rewrite");
}

export async function logRewrite(entry: {
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  status: "success" | "failed" | "reverted";
  model?: string;
  instruction?: string;
  summary?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await prisma.articleRewriteLog.create({
      data: {
        articleId: entry.articleId,
        articleTitle: entry.articleTitle,
        articleSlug: entry.articleSlug,
        status: entry.status,
        model: entry.model ?? "",
        instruction: (entry.instruction ?? "").slice(0, 2000),
        summary: entry.summary ?? null,
        errorMessage: entry.errorMessage?.slice(0, 1000) ?? null,
      },
    });
  } catch (error) {
    // 履歴の書き込み失敗でリライト本体を失敗扱いにしない
    console.error("[rewrite] 履歴の保存に失敗しました:", error);
  }
}
