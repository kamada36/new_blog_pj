export type ShortcodePreset = {
  name: string;
  iconUrl: string;
  position: string; // "l" | "r"
  defaultTalk: string;
};

// バルーンのアイコン画像だけに付ける目印。ArticleBodyのblockquoteコンポーネントが
// この接頭辞を見つけて、通常の引用(.article-callout)ではなく吹き出しレイアウトに切り替える。
export const BALLOON_ICON_ALT_PREFIX = "sc-balloon-";

// WordPress移行時のHTML→Markdown変換で、本文中に生テキストとして残っていた
// [sc ...] ショートコード呼び出しは、`_` や `[` `]` がバックスラッシュエスケープされて
// しまっている(例: `\[sc name="hukidasi1" icon\_url="...easy-peasy\_pWtULVms1b"...\]`)。
// エスケープの有無は記事によってまちまちなため、開き・閉じ括弧とも `\` の有無を両方許容する。
// 独自の [/sc] 閉じタグは実データ上使われていない(WordPress版Shortcoderは属性で完結する)ため対応しない。
const SHORTCODE_PATTERN = /\\?\[sc\s+([^\]]*?)\\?\]/g;

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|avif)$/i;
// 旧WordPress版ショートコードのテンプレートは "%%icon_url:base%%-150x150.png" のように、
// 上書き値(icon_url/img)には拡張子を含めない運用だったため、拡張子が無い場合のみ補う。
const LEGACY_THUMBNAIL_SUFFIX = "-150x150.png";

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, "$1");
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attrString))) {
    if (match[1] !== undefined) attrs[match[1]] = match[2];
    else if (match[3] !== undefined) attrs[match[3]] = match[4];
  }
  return attrs;
}

function resolveIconUrl(url: string): string {
  const trimmed = url.trim();
  return IMAGE_EXTENSION_PATTERN.test(trimmed) ? trimmed : `${trimmed}${LEGACY_THUMBNAIL_SUFFIX}`;
}

function stripWrappingParagraphTag(text: string): string {
  return text.replace(/^<p>([\s\S]*)<\/p>$/i, "$1").trim();
}

/**
 * 記事本文中の [sc name="xxx" ...] (WordPress版Shortcoderと同じ書式)を
 * 通常のMarkdown引用(blockquote)へ展開する。
 * name以外に icon_url(または img)・talk 属性で、プリセットの既定値を上書きできる
 * (WordPress側の %%icon_url:default%% / %%talk:default%% と同じ仕組み)。
 *
 * remark-directive等の新しい構文パーサーは使わない。コロンで始まる独自記法は
 * 「16:9」「3:00」のような実際の記事本文中の時刻・比率表記と衝突し、
 * 誤ったタグ名でのレンダリングエラーを引き起こすことを確認したため、
 * 既存のCommonMark構文の範囲内(画像のalt属性)だけで左右位置を伝える設計にしている。
 */
export function expandShortcodes(markdown: string, presets: ShortcodePreset[]): string {
  if (!markdown.includes("[sc ")) return markdown;
  const byName = new Map(presets.map((preset) => [preset.name, preset]));

  return markdown.replace(SHORTCODE_PATTERN, (match, rawAttrString: string) => {
    const attrString = unescapeMarkdown(rawAttrString);
    const attrs = parseAttributes(attrString);

    const preset = attrs.name ? byName.get(attrs.name) : undefined;
    if (!preset) return match; // 未登録の名前はそのまま残し、目視で気付けるようにする

    const iconOverride = attrs.icon_url ?? attrs.img;
    const iconUrl = iconOverride ? resolveIconUrl(iconOverride) : preset.iconUrl;
    const talk = attrs.talk ? stripWrappingParagraphTag(attrs.talk) : preset.defaultTalk;

    const positionMark = preset.position === "r" ? "r" : "l";
    return `\n\n> ![${BALLOON_ICON_ALT_PREFIX}${positionMark}](${iconUrl})\n>\n> ${talk}\n\n`;
  });
}
