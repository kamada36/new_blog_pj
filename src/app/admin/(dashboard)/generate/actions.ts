"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadArticleForEditor, resolveCategoryId, upsertArticleDraft } from "@/lib/ai/articleStore";
import { generateAndStoreEyecatch } from "@/lib/ai/eyecatch";
import { describeAiError } from "@/lib/ai/provider";
import { searchNews, type NewsItem } from "@/lib/ai/news";
import { scrapeUrl, type ScrapeResult } from "@/lib/ai/scrape";

type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const SESSION_EXPIRED = "セッションが切れました。ログインし直してください。";

/** トピック(キーワード)に関する直近のニュースを取得する(Googleニュース RSS)。 */
export async function searchNewsAction(keyword: string): Promise<ActionResult<{ items: NewsItem[] }>> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  const query = keyword.trim().slice(0, 100);
  if (!query) return { ok: false, error: "キーワードを入力してください。" };
  try {
    return { ok: true, items: await searchNews([query]) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ニュースの取得に失敗しました。" };
  }
}

/** アフィリエイト(テキストリンク)のリンク先ページの内容を取得する。 */
export async function scrapeUrlAction(url: string): Promise<ActionResult<ScrapeResult>> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  try {
    return { ok: true, ...(await scrapeUrl(url)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "取得に失敗しました。" };
  }
}

const saveSchema = z.object({
  articleId: z.string().max(100).optional(),
  title: z.string().trim().min(1, "タイトルを入力してください。").max(200),
  contentMarkdown: z.string().min(1, "本文がありません。"),
  excerpt: z.string().trim().max(400).default(""),
  categoryId: z.string().max(100).default(""),
  tagNames: z.array(z.string().max(60)).max(20).default([]),
  metaTitle: z.string().trim().max(200).default(""),
  metaDescription: z.string().trim().max(300).default(""),
  coverImageUrl: z.string().max(2000).nullable().optional(),
});

/**
 * 画面で編集した内容をSupabase(Articleテーブル)へ保存する。
 * articleIdがあればその記事を更新、無ければ新規の下書きを作成する(upsert)。
 */
export async function saveGeneratedArticleAction(
  input: z.input<typeof saveSchema>
): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SESSION_EXPIRED };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容をご確認ください。" };
  const data = parsed.data;

  try {
    const saved = await upsertArticleDraft(data.articleId, user.id, {
      title: data.title,
      excerpt: data.excerpt || data.metaDescription,
      contentMarkdown: data.contentMarkdown,
      categoryId: await resolveCategoryId(data.categoryId),
      tagNames: data.tagNames,
      metaTitle: data.metaTitle || data.title,
      metaDescription: data.metaDescription,
      metaKeywords: data.tagNames.join(", "),
      coverImageUrl: data.coverImageUrl,
    });
    return { ok: true, id: saved.id, slug: saved.slug };
  } catch (error) {
    console.error("[generate] 記事の保存に失敗しました:", error);
    return { ok: false, error: error instanceof Error ? error.message : "保存に失敗しました。" };
  }
}

/** 保存済みの生成記事を読み込む(ページを開き直したときの復元用)。 */
export async function loadGeneratedArticleAction(articleId: string) {
  if (!(await getSessionUser())) return { ok: false as const, error: SESSION_EXPIRED };
  const article = await loadArticleForEditor(articleId);
  if (!article) return { ok: false as const, error: "記事が見つかりませんでした(削除された可能性があります)。" };
  return {
    ok: true as const,
    article: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      contentMarkdown: article.contentMarkdown,
      categoryId: article.categoryId,
      status: article.status,
      coverImageUrl: article.coverImageUrl,
      metaDescription: article.metaDescription,
      tagNames: article.tags.map((t) => t.name),
    },
  };
}

/** 記事の本文はそのままに、アイキャッチ画像だけを(編集後のプロンプトで)再生成する。 */
export async function regenerateEyecatchAction(input: {
  articleId?: string;
  prompt: string;
}): Promise<ActionResult<{ imageUrl: string }>> {
  if (!(await getSessionUser())) return { ok: false, error: SESSION_EXPIRED };
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, error: "画像生成プロンプトを入力してください。" };

  try {
    const imageUrl = await generateAndStoreEyecatch(prompt);
    if (input.articleId) {
      await prisma.article.updateMany({ where: { id: input.articleId }, data: { coverImageUrl: imageUrl } });
    }
    return { ok: true, imageUrl };
  } catch (error) {
    console.error("[generate] アイキャッチ画像の再生成に失敗しました:", error);
    return { ok: false, error: describeAiError(error) };
  }
}
