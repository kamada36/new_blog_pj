// AIが出力したMarkdown本文を、このブログの描画仕様に合わせて正規化する。
//
// このブログの本文はMarkdown(react-markdown + remark-gfm)として描画され、生HTMLは表示されない
// (rehype-rawなし)。プロンプトでHTMLを禁止していても、モデルが <br> や <strong> を混ぜることは
// あるため、ここで機械的に取り除く/Markdownへ置き換える。コードブロック・インラインコード内は触らない。
import {
  isBalloonCharacter,
  isEmotion,
  resolveEmotionIconUrl,
  type BalloonCharacter,
  type Emotion,
} from "./emotions";

const FENCED_OR_INLINE_CODE = /(```[\s\S]*?```|`[^`\n]+`)/g;

function stripWrappingCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i);
  return match ? match[1].trim() : trimmed;
}

/** コードブロック・インラインコードを除いた部分にだけ fn を適用する。 */
function mapOutsideCode(text: string, fn: (segment: string) => string): string {
  return text
    .split(FENCED_OR_INLINE_CODE)
    .map((segment, i) => (i % 2 === 1 ? segment : fn(segment)))
    .join("");
}

function convertHtmlToMarkdown(segment: string): string {
  return segment
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<\/?(?:span|div|p|font|section|article|figure|figcaption|u|mark)\b[^>]*>/gi, "")
    .replace(/&nbsp;/g, " ");
}

// ─── 吹き出しショートコード ───────────────────────────────────────────────

// 感情アイコンの指定が無いときに、台詞の内容から感情を推定するためのキーワード
const EMOTION_KEYWORDS: Record<Exclude<Emotion, "normal">, string[]> = {
  happy: ["嬉しい", "良かった", "素晴らしい", "おめでとう", "最高", "楽しい", "ありがとう", "！！", "笑"],
  sad: ["悲しい", "残念", "つらい", "辛い", "落ち込", "ショック"],
  worried: ["心配", "不安", "大丈夫かな", "どうしよう", "難しい", "困った", "うーん"],
  surprised: ["えっ", "そうなんですか", "本当に", "知らなかった", "驚き", "意外", "なんと"],
  crying: ["涙", "泣きたい", "号泣", "つらすぎ", "悲しすぎ"],
  exasperated: ["呆れ", "やれやれ", "仕方ない", "はぁ...", "またか"],
  blank: ["絶望", "言葉が出ない", "茫然", "唖然", "何も言えない"],
  wink: ["内緒", "ここだけの話", "実はね", "ふふ", "秘密"],
  annoyed: ["イライラ", "ムッと", "勘弁", "いい加減", "もう！"],
};

export function detectEmotion(text: string): Emotion {
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS) as [Exclude<Emotion, "normal">, string[]][]) {
    if (keywords.some((kw) => text.includes(kw))) return emotion;
  }
  return "normal";
}

const SHORTCODE_OPEN = /\\?\[sc\s+/g;
// talk の値の中に引用符が混ざっても、「次の属性」または「閉じ括弧」の直前の引用符を終端とみなす。
const ATTRIBUTE =
  /\s*([\w-]+)\s*=\s*(?:"([\s\S]*?)"(?=\s+[\w-]+\s*=|\s*\\?\])|'([\s\S]*?)'(?=\s+[\w-]+\s*=|\s*\\?\]))/y;
const SHORTCODE_CLOSE = /\s*\\?\]/y;

function sanitizeTalk(talk: string): string {
  return talk
    .replace(/\s*\n\s*/g, " ")
    .replace(/"/g, "”")
    .replace(/\[/g, "［")
    .replace(/\]/g, "］")
    .trim();
}

export interface NormalizeShortcodeOptions {
  /** true: 感情・アイコンの指定が無い吹き出しにも感情アイコンを割り当てる(新規生成)。false: 既存のプリセットアイコンのままにする(リライト)。 */
  fillMissingIcon: boolean;
}

/**
 * [sc name="hukidasi1" emotion="happy" talk='...'] を、このブログの expandShortcodes が読める正規の形
 * [sc name="hukidasi1" icon_url="https://.../xxx-150x150.png" talk="..."] に整える。
 * emotion属性(AI用)はアイコンURLへ解決して取り除く。解析できない記述は触らずそのまま残す。
 */
export function normalizeShortcodes(text: string, options: NormalizeShortcodeOptions): string {
  let result = "";
  let cursor = 0;
  SHORTCODE_OPEN.lastIndex = 0;

  for (let open = SHORTCODE_OPEN.exec(text); open; open = SHORTCODE_OPEN.exec(text)) {
    const attrs: Record<string, string> = {};
    let pos = open.index + open[0].length;

    // 先頭の「name="..."」から順に属性を読む
    for (;;) {
      ATTRIBUTE.lastIndex = pos;
      const match = ATTRIBUTE.exec(text);
      if (!match) break;
      attrs[match[1]] = match[2] ?? match[3] ?? "";
      pos = ATTRIBUTE.lastIndex;
    }
    SHORTCODE_CLOSE.lastIndex = pos;
    const close = SHORTCODE_CLOSE.exec(text);
    if (!close || !attrs.name) continue; // 解析できない記述はそのまま残す

    const end = SHORTCODE_CLOSE.lastIndex;
    const talk = sanitizeTalk(attrs.talk ?? "");

    let iconUrl = attrs.icon_url ?? attrs.img;
    if (!iconUrl && isBalloonCharacter(attrs.name)) {
      const emotion = attrs.emotion && isEmotion(attrs.emotion) ? attrs.emotion : null;
      if (emotion || options.fillMissingIcon) {
        iconUrl = resolveEmotionIconUrl(attrs.name as BalloonCharacter, emotion ?? detectEmotion(talk));
      }
    }

    const rebuilt =
      `[sc name="${attrs.name}"` + (iconUrl ? ` icon_url="${iconUrl}"` : "") + (attrs.talk !== undefined ? ` talk="${talk}"` : "") + "]";

    result += text.slice(cursor, open.index) + rebuilt;
    cursor = end;
    SHORTCODE_OPEN.lastIndex = end;
  }

  return result + text.slice(cursor);
}

// ─── 全体の正規化 ─────────────────────────────────────────────────────────

export interface NormalizeArticleOptions extends NormalizeShortcodeOptions {
  /** true: 先頭のH1を除き、H1→H2・H4以降→H3へ寄せる(新規生成)。false: 見出しの階層には触れない(既存記事のリライト)。 */
  normalizeHeadings: boolean;
}

export function normalizeArticleMarkdown(raw: string, options: NormalizeArticleOptions): string {
  let text = stripWrappingCodeFence(raw);

  text = mapOutsideCode(text, convertHtmlToMarkdown);
  text = normalizeShortcodes(text, options);

  if (options.normalizeHeadings) {
    // 記事タイトル(H1)はサイト側がページ見出しとして表示するため、本文先頭のH1は取り除く。
    // それ以外のH1はH2へ、H4以下はH3へ寄せる(目次はH2/H3だけを拾うため)。
    text = text.replace(/^\s*#[ \t]+[^\n]*\n+/, "");
    text = mapOutsideCode(text, (segment) =>
      segment
        .split("\n")
        .map((line) => {
          if (/^#[ \t]+/.test(line)) return `#${line}`;
          if (/^#{4,}[ \t]+/.test(line)) return line.replace(/^#{4,}/, "###");
          return line;
        })
        .join("\n")
    );
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// ─── 補助 ─────────────────────────────────────────────────────────────────

/** SEOメタ生成・文字数カウント用に、Markdownの記号と吹き出しコードを除いた地の文だけを取り出す。 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[sc\s[^\]]*?talk="([^"]*)"[^\]]*\]/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*[#>\-*+|][ \t]*/gm, "")
    .replace(/[*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function countArticleChars(markdown: string): number {
  return markdownToPlainText(markdown).replace(/\s/g, "").length;
}
