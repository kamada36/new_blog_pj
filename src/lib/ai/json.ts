// 構成案JSONはストリーミングで少しずつ届くため、受信途中のテキストは閉じ括弧が足りない
// 不完全なJSONになる。コードフェンスの除去と、閉じ括弧が欠けたJSONの機械的な復元を行ってからパースする。
// サーバー(最終チェック)・クライアント(受信中のプレビュー)の両方から使うため、Node固有APIには依存しない。

export function extractJsonFromText(text: string): string {
  const withoutFences = text.replace(/```(?:json)?\s*([\s\S]*?)```/i, "$1").trim();
  const firstBrace = withoutFences.indexOf("{");
  if (firstBrace < 0) return withoutFences;
  const raw = withoutFences.slice(firstBrace);

  let inString = false;
  let escape = false;
  const stack: string[] = [];
  let endIndex = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) {
        endIndex = i;
        break;
      }
    }
  }

  // 閉じ括弧まで揃っている場合は、それ以降の余計な文章を切り捨てる
  if (endIndex >= 0) {
    return raw.slice(0, endIndex + 1).replace(/,(\s*[}\]])/g, "$1");
  }

  // 受信途中・トークン切れの場合は、開いた文字列と括弧を機械的に閉じて復元する
  let repaired = raw;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,(\s*)$/, "$1");
  while (stack.length) repaired += stack.pop();
  return repaired.replace(/,(\s*[}\]])/g, "$1");
}

export interface OutlineSubsection {
  h3?: string;
  keyPoints?: string[];
  toneNote?: string;
}

export interface OutlineSection {
  h2?: string;
  purpose?: string;
  subsections?: OutlineSubsection[];
}

export interface ParsedOutline {
  title?: string;
  metaDescription?: string;
  slug?: string;
  /** サイトに登録済みのカテゴリーslugのうち、記事に最も合うもの */
  categorySlug?: string;
  targetKeywords?: string[];
  introduction?: string;
  researchFacts?: string;
  sections?: OutlineSection[];
  conclusion?: string;
  affiliateNotes?: string[];
}

/** 復元・パースに失敗してもthrowせず、呼び出し側でnullとして扱えるようにする。 */
export function tryParseOutline(raw: string): ParsedOutline | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(extractJsonFromText(raw));
    return parsed && typeof parsed === "object" ? (parsed as ParsedOutline) : null;
  } catch {
    return null;
  }
}
