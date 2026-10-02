// 記事の行間(ブロック間の余白)を、保存前に機械的に付与する。
//
// Markdownは空行を何行重ねても1つに潰れるため、AIに「空行を増やして」と指示しても画面上の行間は変わらない。
// そこでAIには「ひとまとまり(段落・吹き出し・表・リストなど)ごとに空行1つで区切る」ことだけを守らせ、
// 実際の行間は、&nbsp; だけの段落(スペーサー)を挿入して作る。&nbsp; の段落は表示上「1行ぶんの空白」になる。
//
// サイトのCSS(.article-body)での見え方(本文の1行 ≒ 32px、ブロック間の標準の余白 ≒ 21px):
//   スペーサー1つ  → ブロック間が約74px(≒2〜3行)
//   スペーサー2つ  → 約127px(≒4行)。見出しの上はh2/h3のmargin-topも加わり約140〜150px(≒4〜5行)
// 行間の量を変えたいときは、下の GAP の個数を変える。

/** ブロックの間に入れるスペーサー(&nbsp;だけの段落)の個数 */
export const GAP = {
  /** 通常の段落・リスト・表・囲みどうし(ひとまとまりごと) */
  block: 1,
  /** 見出し(H2/H3)の直前 = 前のセクションが終わったタイミング */
  beforeHeading: 2,
  /** 見出しの直後(見出しと本文は近づけて、見出しが本文の一部だと分かるようにする) */
  afterHeading: 0,
  /** 吹き出しとそれ以外の間(吹き出しの前後) */
  aroundBalloon: 1,
  /** 吹き出しどうしの間(掛け合いの途中。吹き出し自体が上下に余白を持つため追加しない) */
  betweenBalloons: 0,
} as const;

export const SPACER = "&nbsp;";

type BlockKind = "heading" | "balloon" | "list" | "continuation" | "other";

function classify(block: string): BlockKind {
  if (/^#{2,3}[ \t]/.test(block)) return "heading";
  if (/^\[sc\s[^\n]*\]\s*$/.test(block)) return "balloon";
  if (/^[ \t]{2,}\S|^\t/.test(block)) return "continuation"; // リストの続きなど、字下げされたブロック
  if (/^([-*+]|\d+[.)])[ \t]/.test(block)) return "list";
  return "other";
}

/** 空行区切りでブロックに分ける。コードフェンスの中の空行では分けない。 */
function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

function gapBetween(prev: BlockKind, next: BlockKind): number {
  // 続き・連続するリストの項目どうしは、同じひとまとまりとして間を空けない
  if (next === "continuation") return 0;
  if (prev === "list" && next === "list") return 0;
  if (next === "heading") return GAP.beforeHeading;
  if (prev === "heading") return GAP.afterHeading;
  if (prev === "balloon" && next === "balloon") return GAP.betweenBalloons;
  if (prev === "balloon" || next === "balloon") return GAP.aroundBalloon;
  return GAP.block;
}

/** 既に挿入されているスペーサーを取り除く(AIに渡す前・付け直す前に使う)。 */
export function stripSpacers(markdown: string): string {
  return markdown
    .replace(/^[ \t]*&nbsp;[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasSpacers(markdown: string): boolean {
  return /^[ \t]*&nbsp;[ \t]*$/m.test(markdown);
}

/** ブロックの間にスペーサーを挿入する。何度かけても結果が変わらない(先に既存のスペーサーを除く)。 */
export function applyArticleSpacing(markdown: string): string {
  const blocks = splitBlocks(stripSpacers(markdown));
  if (blocks.length === 0) return "";

  const kinds = blocks.map(classify);
  const out: string[] = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    for (let n = gapBetween(kinds[i - 1], kinds[i]); n > 0; n--) out.push(SPACER);
    out.push(blocks[i]);
  }
  return out.join("\n\n");
}
