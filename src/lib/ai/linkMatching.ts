// 内部リンク候補の、安価な語句ベースの事前絞り込み。
// reference-tools/WP_Rewrite_PJ の lib/link-matching.ts を移植したもの(記事IDを文字列にした以外は同じ)。
//
// 全記事の要約を毎回AIに渡すのは無駄が大きい。そこで、文字bigramのTF-IDFコサイン類似度(分かち書き不要で
// 日本語に使える)で記事群を順位付けし、上位の数件だけをAIへ渡して「自然に紹介できるか」の最終判断をさせる。

export interface MatchDoc {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  /** 照合の精度を上げるためだけの追加テキスト(例: 元記事の見出し) */
  extra?: string;
}

/** 句読点・空白は除く。「の」「です」のようなbigramのノイズはTF-IDFが自然に軽くする。 */
function normalizeForBigrams(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigramCounts(text: string): Map<string, number> {
  const normalized = normalizeForBigrams(text);
  const counts = new Map<string, number>();
  for (let i = 0; i < normalized.length - 1; i++) {
    const gram = normalized.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** タイトルとキーワードは話題を表す最も強い手がかりなので、繰り返して要約より重みを付ける。 */
function docText(doc: MatchDoc): string {
  const keywords = doc.keywords.join(" ");
  return [doc.title, doc.title, keywords, keywords, doc.summary, doc.extra ?? ""].join(" ");
}

function haystack(doc: MatchDoc): string {
  return normalizeForBigrams([doc.title, doc.keywords.join(" "), doc.summary].join(" "));
}

interface IndexedDoc {
  doc: MatchDoc;
  vector: Map<string, number>;
  norm: number;
  haystack: string;
}

const MIN_KEYWORD_CHARS = 2;
const KEYWORD_HIT_BONUS = 0.04;
const MAX_KEYWORD_HITS = 6;

export interface MatchCorpus {
  /** sourceとの関連が高い順に記事を返す。source自身と excludeIds は含めない。 */
  shortlist(source: MatchDoc, limit: number, excludeIds?: ReadonlySet<string>): MatchDoc[];
}

/** 記事群のIDF重みを一度だけ計算し、複数のsourceを安く順位付けできるようにする。 */
export function createMatchCorpus(docs: MatchDoc[]): MatchCorpus {
  const documentFrequency = new Map<string, number>();
  const rawVectors = docs.map((doc) => bigramCounts(docText(doc)));
  for (const vector of rawVectors) {
    for (const gram of vector.keys()) {
      documentFrequency.set(gram, (documentFrequency.get(gram) ?? 0) + 1);
    }
  }

  const totalDocs = docs.length;
  const idf = (gram: string) => Math.log((totalDocs + 1) / ((documentFrequency.get(gram) ?? 0) + 1)) + 1;

  function weigh(counts: Map<string, number>): { vector: Map<string, number>; norm: number } {
    const vector = new Map<string, number>();
    let sumSquares = 0;
    for (const [gram, count] of counts) {
      const weight = (1 + Math.log(count)) * idf(gram);
      vector.set(gram, weight);
      sumSquares += weight * weight;
    }
    return { vector, norm: Math.sqrt(sumSquares) };
  }

  const indexed: IndexedDoc[] = docs.map((doc, i) => ({
    doc,
    ...weigh(rawVectors[i]),
    haystack: haystack(doc),
  }));

  function keywordHits(source: MatchDoc, sourceHaystack: string, target: IndexedDoc): number {
    let hits = 0;
    for (const keyword of source.keywords) {
      const key = normalizeForBigrams(keyword);
      if (key.length >= MIN_KEYWORD_CHARS && target.haystack.includes(key)) hits++;
    }
    for (const keyword of target.doc.keywords) {
      const key = normalizeForBigrams(keyword);
      if (key.length >= MIN_KEYWORD_CHARS && sourceHaystack.includes(key)) hits++;
    }
    return Math.min(hits, MAX_KEYWORD_HITS);
  }

  return {
    shortlist(source, limit, excludeIds) {
      const { vector: sourceVector, norm: sourceNorm } = weigh(bigramCounts(docText(source)));
      const sourceHaystack = haystack(source);
      if (sourceNorm === 0) return [];

      const scored: { doc: MatchDoc; score: number }[] = [];
      for (const target of indexed) {
        if (target.doc.id === source.id || excludeIds?.has(target.doc.id)) continue;
        if (target.norm === 0) continue;

        let dot = 0;
        for (const [gram, weight] of sourceVector) {
          const other = target.vector.get(gram);
          if (other) dot += weight * other;
        }
        const cosine = dot / (sourceNorm * target.norm);
        const score = cosine + KEYWORD_HIT_BONUS * keywordHits(source, sourceHaystack, target);
        if (score > 0) scored.push({ doc: target.doc, score });
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map((entry) => entry.doc);
    },
  };
}
