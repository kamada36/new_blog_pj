// 記事リライト(/admin/rewrite)で使うプロンプトの組み立て。
// reference-tools/WP_Rewrite_PJ の lib/gemini.ts(リライトのルール・継続生成・「===SUMMARY===」による変更概要)と
// lib/internal-links.ts(内部リンクの挿入指示)を踏襲し、HTML前提の指示をこのブログのMarkdown向けに書き換えている。
import { MARKDOWN_GUIDELINES, buildSiteConcept, type ResidentPersona } from "./guidelines";
import { formatJapaneseDate } from "./articlePrompts";

/** モデルの出力のうち、本文と変更概要を分ける区切り(行頭〜行末の「===SUMMARY===」)。 */
export const SUMMARY_DIVIDER = /\n?===\s*SUMMARY\s*===\n?/i;

export interface InternalLinkRequest {
  /** サイト内パス(/articles/xxx) */
  url: string;
  title: string;
}

export function buildInternalLinkSection(links: InternalLinkRequest[]): string {
  if (links.length === 0) return "";
  const list = links.map((link, i) => `${i + 1}. 記事タイトル: ${link.title}\n   URL: ${link.url}`).join("\n");

  return `
# 挿入する内部リンク(必須)
以下の自サイト記事へのリンクを、本文中でもっとも自然な位置に1件ずつ挿入すること。
- 各リンクは「案内文の段落」→「あわせて読みたいの囲み」の順で挿入する。案内文は文脈に合わせて自然に書く(例: 「〇〇の詳細については、こちらの記事で解説しています。」)。
- 囲みは次の形式を一字一句そのまま使う(「>」の囲みの中に、太字の見出しと、記事タイトルをアンカーテキストにしたリンクを置く。前後は空行):
  > **☕ あわせて読みたい**
  >
  > [記事タイトル](URL)
- 挿入位置は、その話題を扱っている段落・見出しの直後など、流れが途切れない場所を選ぶ。
- URLは下記のものを一字一句変えずに使う。下記以外のURLを作らない。各リンクは1回だけ挿入する。
- 本文の既存の意味・構成は変えず、リンクの案内として追加する文(または段落)以外の事実を書き足さない。

## 挿入するリンク一覧
${list}
`;
}

export interface RewritePromptInput {
  title: string;
  contentMarkdown: string;
  instruction?: string;
  internalLinks: InternalLinkRequest[];
  /** 本文の先頭に「最終更新日」の1行を入れる(既にあれば日付を更新する) */
  insertUpdatedNote: boolean;
  resident?: ResidentPersona;
}

export function buildRewritePrompt(input: RewritePromptInput): { system: string; prompt: string } {
  const { title, contentMarkdown, instruction, internalLinks, insertUpdatedNote, resident } = input;
  const hasInstruction = Boolean(instruction?.trim());
  const today = formatJapaneseDate();

  const rules = [
    "文章の意味・事実関係は変更せず、本文のMarkdown構造(見出し ##・###、箇条書き、番号付きリスト、表、「>」の囲み、吹き出しのショートコード、画像、リンク)は保持したまま、自然な言い回し・表現の改善・読みやすさの向上を行うこと。",
    "既存の画像(![](URL))・リンク([テキスト](URL))・アフィリエイトのバナー・吹き出しの属性(name・icon_url・emotion)は、一字一句変えずにそのままの位置に残すこと。新しい画像やURLを作らないこと。",
    "吹き出し([sc name=\"...\" ... talk=\"...\"])の台詞(talk)は、キャラクターの口調(hukidasi1=敬語のやさしい語りかけ、hukidasi2=タメ口)を保ったまま磨いてよい。talkの中に半角の「\"」「'」「[」「]」を入れないこと(引用は全角の「」を使う)。吹き出しの数や並び順は変えないこと。",
    "「>」の囲み(吹き出しアイコン画像付きの囲みを含む)は、囲みの構造を保ったまま中身の文章だけを磨くこと。",
    "本文中にHTMLタグが混ざっている場合は、同じ意味のMarkdown記法に置き換えてよい。置き換えられないものはそのまま残すこと。",
    insertUpdatedNote
      ? `本文の先頭に、独立した1つの段落として「【最終更新日: ${today}】」の1行を置くこと。既に同様の「最終更新日」の行が先頭にある場合は、重複させず日付だけを${today}に更新すること。`
      : "「最終更新日」などの日付の行を新たに追加しないこと(既にある場合はそのまま残す)。",
    "出力はMarkdownの本文のみ。コードフェンス(```)で全体を囲まないこと。記事タイトルや「以下がリライト結果です」等の余計な解説文は一切出力に含めないこと。",
    "本文の出力が終わったら、必ず単独の行に \"===SUMMARY===\" とだけ書き、その次の行から今回のリライトでどのような変更を加えたかの概要を日本語1〜2文で書くこと。変更前後の具体的な文言の引用や詳細な差分は書かず、「専門用語をかみ砕いて説明を追加した」「見出しの言い回しを整理した」のようなざっくりとした説明にすること。",
  ];
  if (hasInstruction) {
    rules.push("上記の「この記事固有の追加指示」は、他のルールと矛盾しない範囲で必ず反映すること。");
  }
  if (internalLinks.length > 0) {
    rules.push(
      "上記の「挿入する内部リンク」は必ず全件挿入すること。リンクの案内文や囲みの追加は、構造保持のルールの例外として認める。"
    );
  }

  const system = `あなたはプロのWebライター兼SEOスペシャリストです。このブログの既存記事(Markdown)をリライトします。
今日の日付は${today}です。

${buildSiteConcept(resident)}

${MARKDOWN_GUIDELINES}

# リライトの方針
リライトは「別の記事に書き換える」ことではなく、「今の記事の意味と構成を保ったまま、読みやすさ・分かりやすさ・サイトの語り口との一貫性を高める」ことです。上記のMarkdownの書き方は、リライト後の本文にも適用してください(ただし既存の見出しの階層や構成は変更しない)。`;

  const instructionSection = hasInstruction ? `\n# この記事固有の追加指示(最優先で反映すること)\n${instruction!.trim()}\n` : "";

  const prompt = `以下のMarkdown記事本文をリライトしてください。

# 記事タイトル
${title}

# 記事本文(Markdown)
${contentMarkdown}
${instructionSection}${buildInternalLinkSection(internalLinks)}
# リライトのルール(必須)
${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}`;

  return { system, prompt };
}

/** 出力上限で途中終了した場合の続き生成用。 */
export function buildRewriteContinuationPrompt(tailText: string): string {
  return `直前のMarkdown本文の生成が文字数上限で途中に打ち切られました。以下は出力済みテキストの末尾です。
--- 末尾ここから ---
${tailText}
--- 末尾ここまで ---
この続きから自然につながるように、Markdown本文の続きだけを出力してください。上記末尾の文言を繰り返さないこと。挨拶や前置きは不要です。
本文が完結したら、必ず単独の行に "===SUMMARY===" とだけ書き、その次の行から今回のリライトでどのような変更を加えたかの概要を日本語1〜2文で書くこと。`;
}

/** モデル出力を、本文と変更概要に分ける。 */
export function splitContentAndSummary(text: string): { content: string; summary: string | null } {
  const match = text.match(SUMMARY_DIVIDER);
  if (!match || match.index === undefined) {
    return { content: text.trim(), summary: null };
  }
  return {
    content: text.slice(0, match.index).trim(),
    summary: text.slice(match.index + match[0].length).trim() || null,
  };
}
