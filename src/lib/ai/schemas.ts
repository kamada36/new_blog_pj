import { z } from "zod";
import { MAX_LINKS_PER_TYPE, parseBannerHtml } from "./affiliate";

// Route Handler / Server Actionが受け取る入力の検証。クライアントの値はそのままプロンプトに入るため、
// 型・長さ・件数をここで必ず絞る。

const textLinkSchema = z.object({
  url: z.string().trim().max(2000),
  anchorText: z.string().trim().max(300),
  info: z.string().max(6000).optional(),
});

const bannerLinkSchema = z.object({
  html: z.string().max(20000),
  note: z.string().trim().max(500).optional(),
});

const linksFields = {
  // 空行(未入力の入力欄)は取り除き、バナーは本文に埋め込める形式のものだけを通す
  textLinks: z
    .array(textLinkSchema)
    .max(MAX_LINKS_PER_TYPE)
    .default([])
    .transform((links) => links.filter((link) => /^https?:\/\//i.test(link.url))),
  bannerLinks: z
    .array(bannerLinkSchema)
    .max(MAX_LINKS_PER_TYPE)
    .default([])
    .transform((links) => links.filter((link) => link.html.trim() && parseBannerHtml(link.html) !== null)),
};

const wordCountSchema = z.number().int().min(1000).max(20000);

export const outlineRequestSchema = z.object({
  source: z.string().trim().min(1, "ソース情報を入力してください。").max(20000),
  modelId: z.string().trim().min(1).max(100),
  wordCount: wordCountSchema,
  ...linksFields,
});

export const articleRequestSchema = z.object({
  source: z.string().trim().min(1, "ソース情報を入力してください。").max(20000),
  modelId: z.string().trim().min(1).max(100),
  wordCount: wordCountSchema,
  outlineJson: z.string().max(80000).optional(),
  additionalInstruction: z.string().trim().max(5000).optional(),
  currentArticle: z.string().max(200000).optional(),
  /** 保存済みの記事を更新する場合のID(追加指示での修正など)。無ければ新規の下書きを作る。 */
  articleId: z.string().max(100).optional(),
  categoryId: z.string().max(100).optional(),
  generateEyecatch: z.boolean().default(true),
  ...linksFields,
});

export const rewriteRequestSchema = z.object({
  articleId: z.string().min(1).max(100),
  modelId: z.string().trim().min(1).max(100),
  instruction: z.string().trim().max(5000).optional(),
  /** 内部リンクとして挿入する自サイト記事のID(URLはサーバー側でDBから引く) */
  internalLinkArticleIds: z.array(z.string().max(100)).max(5).default([]),
  publishStatus: z.enum(["keep", "draft", "published"]).default("keep"),
  insertUpdatedNote: z.boolean().default(true),
});

export type OutlineRequest = z.infer<typeof outlineRequestSchema>;
export type ArticleRequest = z.infer<typeof articleRequestSchema>;
export type RewriteRequest = z.infer<typeof rewriteRequestSchema>;
