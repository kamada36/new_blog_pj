import "server-only";
import { extractJsonFromText } from "@/lib/ai/json";
import { markdownToPlainText } from "@/lib/ai/markdown";
import { DEFAULT_REWRITE_MODEL } from "@/lib/ai/models";
import { generateShortText } from "@/lib/ai/provider";
import { extractHeadings } from "@/lib/toc";
import { countChars, MAIN_MAX_CHARS, normalizePostText, REPLY_MAX_CHARS, SNS_VARIANTS } from "./format";

// 記事の紹介投稿(X・Threads)の文面をAIで作る。切り口(variant)ごとに「メイン投稿」と、リンクを付けて記事を紹介する「返信(ツリー)の投稿」を返す。
// 件数が多い下処理なので、リライト本体とは独立した安価な標準モデルに固定する。リンク(URL)はAIには書かせず、出力時に返信の末尾へ付ける。

const SNS_MODEL = DEFAULT_REWRITE_MODEL;
/** 本文の何文字までをAIに渡すか。冒頭と見出しが話題を表し、末尾はほとんど足しにならない。 */
const BODY_CHARS = 3500;
const MAX_ATTEMPTS = 2;

export interface SnsArticleSource {
  title: string;
  metaDescription: string;
  excerpt: string;
  contentMarkdown: string;
  /** 内部リンク用の記事索引(あれば使う) */
  summary?: string;
  keywords?: string[];
}

export interface GeneratedSnsPost {
  variant: number;
  mainText: string;
  replyBody: string;
}

function buildPrompts(article: SnsArticleSource, variants: number[], retryNote?: string): { system: string; prompt: string } {
  const specs = SNS_VARIANTS.filter((v) => variants.includes(v.variant))
    .map((v) => `- パターン${v.variant}「${v.label}」: ${v.brief}`)
    .join("\n");

  const system = `あなたは、IT業界への転職・キャリアを発信するブログ「レジリエンサーCafe」のSNS運用担当です。ブログ記事を紹介する、X(旧Twitter)とThreads向けの投稿文を日本語で作ります。
【メイン投稿の条件】
- 記事の中身から、読者に役立つ気づき・考え方をそのまま届ける。記事を読まなくても価値が伝わる文にする(「記事を書きました」「ブログ更新」のような告知調にしない)
- ${MAIN_MAX_CHARS}文字以内(改行・ハッシュタグを含めて数える)。改行は、文や意味のまとまりの区切りにだけ入れる(文の途中では改行しない)。1文は句点(。)で終える。段落の間は空行を1つ入れてよい
- 記事に書かれている内容だけを根拠にする。記事に無い数字・実績・体験談・断定を足さない。誇大な表現や、煽りだけの文にしない
- URLは書かない(リンクは別の返信に付ける)
- 末尾に、空行を1つ空けてハッシュタグを2個付ける(記事の主題に合うもの。例: #未経験転職 #ポートフォリオ)
- 絵文字は多くても1個。ASCIIのカンマ(,)は使わず、読点(、)を使う
【返信(ツリー)の条件】
メイン投稿にぶら下げる返信で、記事そのものを紹介する投稿。メイン投稿とは別の文面にし、メイン投稿の文を使い回さない。次の形で書く(各ブロックの間は空行を1つ入れる)。
  1ブロック目(2行): 1行目は「【記事のテーマ(15文字以内)】」と絵文字1個。2行目は、記事の核心を言い切り、または問いかけにしたキャッチコピー
  2ブロック目: 紹介文。記事を読むと何が得られ、どんな考え方に触れられるかを1〜2文で伝える。絵文字は多くても1個
  3ブロック目: ハッシュタグを3個(記事の主題に合うもの。1つはメイン投稿と違うものにする)
- 全体で${REPLY_MAX_CHARS}文字以内(改行・ハッシュタグを含めて数える)。URLは書かない(この後ろにURLが付く)
- パターンごとに、キャッチコピーと紹介文の言い回しを変える
- 記事に書かれている内容だけを根拠にする。ASCIIのカンマ(,)は使わない
【出力形式(厳守)】
次のJSONだけを出力する。前置き・説明・コードフェンスは付けない。
{"posts":[{"variant":1,"main":"メイン投稿","reply":"返信(ツリー)の投稿"}]}
postsには、指定されたパターンの数だけ入れる。mainとreplyの改行・空行は、JSONの文字列として \\n で表す(空行は \\n\\n)。`;

  const headings = extractHeadings(article.contentMarkdown)
    .filter((h) => h.level === 2)
    .map((h) => h.text)
    .join(" / ");
  const body = markdownToPlainText(article.contentMarkdown).slice(0, BODY_CHARS);

  const prompt = [
    `【記事タイトル】\n${article.title}`,
    article.summary ? `【要約】\n${article.summary}` : "",
    article.keywords?.length ? `【キーワード】\n${article.keywords.join("、")}` : "",
    article.metaDescription || article.excerpt ? `【記事の説明】\n${article.metaDescription || article.excerpt}` : "",
    headings ? `【見出し】\n${headings}` : "",
    `【本文(冒頭)】\n${body}`,
    `【作るパターン】\n${specs}`,
    retryNote ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}

function parsePosts(text: string, variants: number[]): GeneratedSnsPost[] {
  const parsed = JSON.parse(extractJsonFromText(text)) as { posts?: unknown };
  if (!Array.isArray(parsed.posts)) throw new Error("AIの応答の形式が正しくありませんでした。");

  const result: GeneratedSnsPost[] = [];
  for (const raw of parsed.posts as { variant?: unknown; main?: unknown; reply?: unknown }[]) {
    const variant = Number(raw?.variant);
    if (!variants.includes(variant) || result.some((r) => r.variant === variant)) continue;
    if (typeof raw.main !== "string" || typeof raw.reply !== "string") continue;
    const mainText = normalizePostText(raw.main);
    const replyBody = normalizePostText(raw.reply);
    if (!mainText || !replyBody) continue;
    result.push({ variant, mainText, replyBody });
  }
  return result.sort((a, b) => a.variant - b.variant);
}

function tooLong(post: GeneratedSnsPost): boolean {
  return countChars(post.mainText) > MAIN_MAX_CHARS || countChars(post.replyBody) > REPLY_MAX_CHARS;
}

/**
 * 指定した切り口の文面を作る。文字数が上限を超えたものがあれば、1度だけ「短く」と伝えて作り直す。
 * 作り直しても超える場合は、そのまま返す(画面の文字数表示で気づけるようにして、保存は止めない)。
 */
export async function generateSnsPosts(article: SnsArticleSource, variants: number[]): Promise<GeneratedSnsPost[]> {
  let best: GeneratedSnsPost[] = [];
  let retryNote: string | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { system, prompt } = buildPrompts(article, variants, retryNote);
    const text = await generateShortText(SNS_MODEL, system, prompt);
    let posts: GeneratedSnsPost[];
    try {
      posts = parsePosts(text, variants);
    } catch {
      if (attempt === MAX_ATTEMPTS - 1 && best.length === 0) throw new Error("AIの応答をJSONとして読み取れませんでした。");
      continue;
    }
    if (posts.length > best.length || (posts.length === best.length && posts.filter(tooLong).length < best.filter(tooLong).length)) {
      best = posts;
    }
    const long = posts.filter(tooLong);
    if (posts.length === variants.length && long.length === 0) return posts;
    retryNote = long.length
      ? `【前回の注意】パターン${long.map((p) => p.variant).join("・")}が長すぎました。メイン投稿は${MAIN_MAX_CHARS}文字以内、返信は${REPLY_MAX_CHARS}文字以内に収めてください。`
      : `【前回の注意】指定した全パターン(${variants.join("・")})を作ってください。`;
  }

  if (best.length === 0) throw new Error("AIが投稿文を返しませんでした。");
  return best;
}
