import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { extractHeadings } from "@/lib/toc";
import { extractJsonFromText } from "./json";
import type { LinkIndexStatus, LinkSuggestionView } from "./linkTypes";
import { createMatchCorpus, type MatchDoc } from "./linkMatching";
import { markdownToPlainText } from "./markdown";
import { DEFAULT_REWRITE_MODEL } from "./models";
import { AiConfigError, generateShortText } from "./provider";

// 内部リンク提案(AIリライトの「内部リンク候補」)。reference-tools/WP_Rewrite_PJ の lib/article-index.ts を、
// WordPress REST APIではなくこのブログのDB(Article)を対象に移植したもの。
//   1. 索引: 公開記事ごとに、AIが「何を解説していて、どんな疑問に答えるか」の要約とキーワードを作る
//   2. 候補: 語句ベースで関連の高い記事を絞り込み、AIが「自然に紹介できるか」を判断して最大3件を選ぶ
//   3. 保存: 記事ごとの結果をDBに保存し、リライト一覧に表示する

/** 索引・候補選びに使うモデル。件数が多い下処理なので、リライト本体とは独立した安価な標準モデルに固定する。 */
const LINK_MODEL = DEFAULT_REWRITE_MODEL;

/** 1回の呼び出しで要約する記事数(1回のリクエストが長くならないよう、画面側で繰り返し呼ぶ) */
export const INDEX_BATCH_SIZE = 15;
/** 1回の呼び出しで候補を探せる元記事の最大数 */
export const MAX_MATCH_BATCH = 10;

const AI_CONCURRENCY = 5;
/** 要約のためにAIへ渡す本文の長さ。冒頭と見出しが話題を表し、末尾はほとんど足しにならない。 */
const SUMMARY_BODY_CHARS = 6000;
const MAX_KEYWORDS = 10;
const MAX_SUGGESTIONS = 3;
/** 語句ベースの絞り込みを通過し、AIの最終判断に渡す候補数 */
const SHORTLIST_SIZE = 12;

// ─── 補助 ─────────────────────────────────────────────────────────────────

/** 並列数を制限して実行する。最初の例外で新規の開始を止め、その例外を投げ直す。 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failure: { error: unknown } | null = null;

  async function worker() {
    while (!failure) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index]);
      } catch (error) {
        failure ??= { error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
  return results;
}

async function generateJson<T>(prompt: string): Promise<T> {
  const text = await generateShortText(
    LINK_MODEL,
    "あなたは指示に従い、JSONだけを出力するアシスタントです。前置き・説明・コードフェンスは出力しません。",
    prompt
  );
  try {
    return JSON.parse(extractJsonFromText(text)) as T;
  } catch {
    throw new Error("AIの応答をJSONとして読み取れませんでした。");
  }
}

/** 本文が既にリンクしている記事のスラッグ(絶対URL・相対URL・旧サイトのURLのいずれの形でも、URLのパス部分から拾う)。 */
export function collectLinkedSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>();
  const urls = markdown.match(/(?:https?:\/\/[^\s)"'<>\]]+|\]\(\/[^\s)]*\))/g) ?? [];
  for (const raw of urls) {
    const cleaned = raw.replace(/^\]\(/, "").replace(/\)$/, "");
    let path = cleaned;
    try {
      path = new URL(cleaned, "https://example.invalid").pathname;
    } catch {
      // 解析できないURLはそのまま扱う
    }
    for (const segment of path.split("/")) {
      if (!segment) continue;
      try {
        slugs.add(decodeURIComponent(segment));
      } catch {
        slugs.add(segment);
      }
    }
  }
  return slugs;
}

// ─── 要約(索引) ──────────────────────────────────────────────────────────

function buildSummaryPrompt(title: string, headings: string[], body: string): string {
  const headingList = headings.length > 0 ? headings.map((h) => `- ${h}`).join("\n") : "(見出しなし)";
  return `あなたはWebメディアの編集者です。以下の記事について、他の記事から内部リンクを張る際に「この記事が何を解説していて、どんな読者の疑問に答えるか」を判断するための概要を作成してください。

# 記事タイトル
${title}

# 記事の見出し
${headingList}

# 記事本文(テキスト。長い場合は冒頭のみ)
${body}

# 出力ルール
- summary: 記事の主題・扱っている範囲・読者が得られることを、日本語で120〜200字程度にまとめる。宣伝調の表現や「この記事では」といった前置きは省く。
- keywords: 記事の主題を表す語句を5〜10個。固有名詞・専門用語・検索されそうな言葉を優先する(日本語)。
- 本文に書かれていないことは書かない。

次のJSONのみを出力してください:
{"summary": "...", "keywords": ["...", "..."]}`;
}

async function summarizeArticle(title: string, markdown: string): Promise<{ summary: string; keywords: string[] }> {
  const body = markdownToPlainText(markdown).slice(0, SUMMARY_BODY_CHARS);
  if (body.length < 20) throw new Error("本文が短すぎるため概要を作成できませんでした。");

  const headings = extractHeadings(markdown).map((h) => h.text);
  const raw = await generateJson<{ summary?: unknown; keywords?: unknown }>(buildSummaryPrompt(title, headings, body));

  const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 500) : "";
  if (!summary) throw new Error("AIが概要を返しませんでした。");

  const keywords = Array.isArray(raw.keywords)
    ? [
        ...new Set(
          raw.keywords
            .filter((k): k is string => typeof k === "string")
            .map((k) => k.trim())
            .filter((k) => k.length > 0 && k.length <= 40)
        ),
      ].slice(0, MAX_KEYWORDS)
    : [];

  return { summary, keywords };
}

async function saveIndexRow(articleId: string, summary: string, keywords: string[]) {
  await prisma.articleLinkIndex.upsert({
    where: { articleId },
    create: { articleId, summary, keywords },
    update: { summary, keywords, summarizedAt: new Date() },
  });
}

export async function getLinkIndexStatus(): Promise<LinkIndexStatus> {
  const [published, indexed] = await Promise.all([
    prisma.article.count({ where: { status: "published" } }),
    prisma.articleLinkIndex.count({ where: { article: { status: "published" } } }),
  ]);
  return { published, indexed };
}

/** 索引を空にする(要約を作り直したいとき。派生データなので記事には影響しない)。 */
export async function resetLinkIndex(): Promise<void> {
  await prisma.$transaction([prisma.articleLinkSuggestion.deleteMany(), prisma.articleLinkIndex.deleteMany()]);
}

export interface IndexBatchResult {
  /** 今回、要約を作成できた記事数 */
  summarized: number;
  /** 今回の失敗(次回以降のリクエストで除外できるようIDを返す) */
  failed: { articleId: string; title: string; error: string }[];
  /** まだ索引が無い公開記事数(failedとexcludeIdsを除く) */
  remaining: number;
}

/** 索引が無い公開記事を、最大 INDEX_BATCH_SIZE 件ぶん要約して保存する。画面から、remainingが0になるまで繰り返し呼ぶ。 */
export async function indexNextBatch(excludeIds: string[]): Promise<IndexBatchResult> {
  const where = {
    status: "published",
    linkIndex: { is: null },
    ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
  } satisfies Prisma.ArticleWhereInput;

  const articles = await prisma.article.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: INDEX_BATCH_SIZE,
    select: { id: true, title: true, contentMarkdown: true },
  });

  const failed: IndexBatchResult["failed"] = [];
  let summarized = 0;

  await mapWithConcurrency(articles, AI_CONCURRENCY, async (article) => {
    try {
      const { summary, keywords } = await summarizeArticle(article.title, article.contentMarkdown);
      await saveIndexRow(article.id, summary, keywords);
      summarized++;
    } catch (error) {
      // APIキーなど設定の問題は、残りの記事も全て同じ理由で失敗するため中断する
      if (error instanceof AiConfigError) throw error;
      failed.push({
        articleId: article.id,
        title: article.title,
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  });

  const processed = new Set([...excludeIds, ...failed.map((f) => f.articleId), ...articles.map((a) => a.id)]);
  const remaining = await prisma.article.count({
    where: { status: "published", linkIndex: { is: null }, id: { notIn: [...processed] } },
  });
  return { summarized, failed, remaining };
}

// ─── 候補の選別 ───────────────────────────────────────────────────────────

interface StoredSuggestion {
  articleId: string;
  reason: string;
}

function parseStored(value: Prisma.JsonValue | null | undefined): StoredSuggestion[] {
  if (!Array.isArray(value)) return [];
  const result: StoredSuggestion[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const { articleId, reason } = item as Record<string, unknown>;
      if (typeof articleId === "string") result.push({ articleId, reason: typeof reason === "string" ? reason : "" });
    }
  }
  return result;
}

function buildMatchPrompt(
  source: { title: string; summary: string; headings: string[] },
  candidates: (MatchDoc & { id: string })[]
): string {
  const headingList = source.headings.length > 0 ? source.headings.map((h) => `- ${h}`).join("\n") : "(見出しなし)";
  const candidateList = candidates.map((c) => `[id=${c.id}] ${c.title}\n概要: ${c.summary}`).join("\n\n");

  return `あなたはWebメディアの編集者です。「元記事」の本文中に、内部リンクとして自然に紹介できる記事を「候補記事」から選んでください。
「〇〇の詳細はこちらの記事で解説しています」のように、文章の流れの中で違和感なく案内できるものだけが対象です。

# 元記事
タイトル: ${source.title}
概要: ${source.summary}
見出し:
${headingList}

# 候補記事
${candidateList}

# 選定ルール
- 元記事の話題を補足・深掘りする記事、読者が次に知りたくなる記事を優先する。
- 元記事と同じ内容の重複記事や、キーワードが似ているだけで文脈がつながらない記事は選ばない。
- 最大${MAX_SUGGESTIONS}件。自然に紹介できる記事がなければ空配列にする(無理に選ばない)。
- reason: 元記事のどの話題(見出し)の流れで、どのように紹介できるかを日本語1文(60字程度)で書く。
- id は候補記事の [id=…] の文字列をそのまま使う。

次のJSONのみを出力してください:
{"suggestions": [{"id": "...", "reason": "..."}]}`;
}

async function pickSuggestions(
  source: { title: string; summary: string; headings: string[] },
  shortlist: MatchDoc[]
): Promise<StoredSuggestion[]> {
  const raw = await generateJson<{ suggestions?: unknown }>(buildMatchPrompt(source, shortlist));
  if (!Array.isArray(raw.suggestions)) return [];

  const allowed = new Set(shortlist.map((doc) => doc.id));
  const picked: StoredSuggestion[] = [];
  for (const item of raw.suggestions) {
    if (!item || typeof item !== "object") continue;
    const { id, reason } = item as { id?: unknown; reason?: unknown };
    // AIが、渡していないIDを作ったり重複させたりしても、候補に挙げたものだけを受け入れる
    if (typeof id !== "string" || !allowed.has(id) || picked.some((p) => p.articleId === id)) continue;
    picked.push({ articleId: id, reason: typeof reason === "string" ? reason.trim().slice(0, 200) : "" });
    if (picked.length >= MAX_SUGGESTIONS) break;
  }
  return picked;
}

/** 保存済みの提案を、紹介先の最新のタイトル・スラッグ(公開中のものだけ)と、元記事で既にリンク済みかの情報つきにする。 */
async function resolveSuggestions(
  stored: StoredSuggestion[],
  sourceContent: string
): Promise<LinkSuggestionView[]> {
  if (stored.length === 0) return [];
  const targets = await prisma.article.findMany({
    where: { id: { in: stored.map((s) => s.articleId) }, status: "published" },
    select: { id: true, title: true, slug: true },
  });
  const byId = new Map(targets.map((t) => [t.id, t]));
  const linkedSlugs = collectLinkedSlugs(sourceContent);

  const views: LinkSuggestionView[] = [];
  for (const item of stored) {
    const target = byId.get(item.articleId);
    if (!target) continue;
    views.push({
      articleId: target.id,
      title: target.title,
      slug: target.slug,
      reason: item.reason,
      linked: linkedSlugs.has(target.slug),
    });
  }
  return views;
}

/**
 * 表示中の記事ぶんの、保存済みの候補を読む。まだ候補を探していない記事はキーに含まれない
 * (「候補なし」と「未検索」を区別するため)。
 */
export async function loadSuggestions(
  articles: { id: string; contentMarkdown: string }[]
): Promise<Record<string, LinkSuggestionView[]>> {
  if (articles.length === 0) return {};
  const records = await prisma.articleLinkSuggestion.findMany({
    where: { articleId: { in: articles.map((a) => a.id) } },
  });
  const contentById = new Map(articles.map((a) => [a.id, a.contentMarkdown]));

  const result: Record<string, LinkSuggestionView[]> = {};
  for (const record of records) {
    result[record.articleId] = await resolveSuggestions(parseStored(record.suggestions), contentById.get(record.articleId) ?? "");
  }
  return result;
}

/** リライト時にAIへ渡す「紹介できる文脈」(保存済みの提案理由)を、対象記事のID→理由で返す。 */
export async function loadReasons(sourceArticleId: string): Promise<Map<string, string>> {
  const record = await prisma.articleLinkSuggestion.findUnique({ where: { articleId: sourceArticleId } });
  return new Map(parseStored(record?.suggestions).map((s) => [s.articleId, s.reason]));
}

export interface MatchResult {
  results: Record<string, LinkSuggestionView[]>;
  failed: { articleId: string; error: string }[];
}

/**
 * 各記事について、自然に紹介できる記事を0〜3件選んで保存する。
 * 元記事が索引に無ければ、その場で要約を作る。force=false で既に結果がある記事は、そのまま返す。
 */
export async function matchArticles(articleIds: string[], force: boolean): Promise<MatchResult> {
  const ids = [...new Set(articleIds)].slice(0, MAX_MATCH_BATCH);

  const [sources, pool, stored] = await Promise.all([
    prisma.article.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, contentMarkdown: true, linkIndex: { select: { summary: true, keywords: true } } },
    }),
    prisma.articleLinkIndex.findMany({
      where: { article: { status: "published" } },
      select: { articleId: true, summary: true, keywords: true, article: { select: { title: true, slug: true } } },
    }),
    prisma.articleLinkSuggestion.findMany({ where: { articleId: { in: ids } } }),
  ]);

  const storedById = new Map(stored.map((s) => [s.articleId, s]));
  const poolDocs: (MatchDoc & { slug: string })[] = pool.map((p) => ({
    id: p.articleId,
    title: p.article.title,
    summary: p.summary,
    keywords: p.keywords,
    slug: p.article.slug,
  }));
  const corpus = createMatchCorpus(poolDocs);

  const results: MatchResult["results"] = {};
  const failed: MatchResult["failed"] = [];
  let fatal: unknown = null;

  await mapWithConcurrency(sources, AI_CONCURRENCY, async (source) => {
    try {
      const cached = storedById.get(source.id);
      if (cached && !force) {
        results[source.id] = await resolveSuggestions(parseStored(cached.suggestions), source.contentMarkdown);
        return;
      }

      let summary = source.linkIndex?.summary;
      let keywords = source.linkIndex?.keywords ?? [];
      if (!summary) {
        const built = await summarizeArticle(source.title, source.contentMarkdown);
        summary = built.summary;
        keywords = built.keywords;
        await saveIndexRow(source.id, summary, keywords);
      }

      const headings = extractHeadings(source.contentMarkdown).map((h) => h.text);
      // 既にリンクしている記事は、候補にしない
      const linkedSlugs = collectLinkedSlugs(source.contentMarkdown);
      const alreadyLinkedIds = new Set(poolDocs.filter((d) => linkedSlugs.has(d.slug)).map((d) => d.id));

      const shortlist = corpus.shortlist(
        { id: source.id, title: source.title, summary, keywords, extra: headings.join(" ") },
        SHORTLIST_SIZE,
        alreadyLinkedIds
      );
      const picked = shortlist.length > 0 ? await pickSuggestions({ title: source.title, summary, headings }, shortlist) : [];

      await prisma.articleLinkSuggestion.upsert({
        where: { articleId: source.id },
        create: { articleId: source.id, suggestions: picked as unknown as Prisma.InputJsonValue },
        update: { suggestions: picked as unknown as Prisma.InputJsonValue, computedAt: new Date() },
      });
      results[source.id] = await resolveSuggestions(picked, source.contentMarkdown);
    } catch (error) {
      if (error instanceof AiConfigError) {
        fatal ??= error;
        return;
      }
      failed.push({ articleId: source.id, error: error instanceof Error ? error.message : "不明なエラー" });
    }
  });

  if (fatal) throw fatal;
  return { results, failed };
}
