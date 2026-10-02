// 内部リンク提案の、サーバー・画面で共有する型。

/** 画面に表示する内部リンク候補1件。 */
export interface LinkSuggestionView {
  articleId: string;
  title: string;
  slug: string;
  /** 元記事のどの話題の流れで、どう紹介できるか(AIが書いた1文) */
  reason: string;
  /** 元記事の本文が、既にこの記事へリンクしている */
  linked: boolean;
}

export interface LinkIndexStatus {
  /** 公開中の記事数 */
  published: number;
  /** そのうち、要約の索引ができている記事数 */
  indexed: number;
}

/** 内部リンクの挿入形式 */
export const INTERNAL_LINK_FORMATS = ["callout", "text"] as const;
export type InternalLinkFormat = (typeof INTERNAL_LINK_FORMATS)[number];

export const INTERNAL_LINK_FORMAT_LABELS: Record<InternalLinkFormat, string> = {
  callout: "「あわせて読みたい」の囲み",
  text: "文中のテキストリンク",
};

export function isInternalLinkFormat(value: unknown): value is InternalLinkFormat {
  return typeof value === "string" && (INTERNAL_LINK_FORMATS as readonly string[]).includes(value);
}
