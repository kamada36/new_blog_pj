// 記事生成(/admin/generate)で使うプロンプトの組み立て。
// reference-tools/blog2 の gemini.ts / ai-writer.ts のロジック(2段階生成・文字数ガード・継続生成・
// アフィリエイト目印方式)を踏襲しつつ、出力をWordPress用HTMLからこのブログ用Markdownへ変更している。
import {
  ARTICLE_STRUCTURE_RULES,
  MARKDOWN_GUIDELINES,
  OUTLINE_FORMAT,
  buildCategorySection,
  buildSiteConcept,
  type CategoryOption,
  type ResidentPersona,
} from "./guidelines";
import {
  bannerLinkPlaceholder,
  maskAffiliateLinks,
  textLinkPlaceholder,
  type BannerLinkInput,
  type TextLinkInput,
} from "./affiliate";
import { getMaxOutputTokensForModel, isVerbosityRiskModel } from "./models";
import { computeOutlinePlan } from "./outlinePlan";
import { markdownToPlainText } from "./markdown";

export function formatJapaneseDate(date = new Date()): string {
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`;
}

// ─── Stage 1: リサーチ & 構成案(Google Search Grounding) ─────────────────────

export interface OutlinePromptInput {
  source: string;
  wordCount: number;
  textLinks: TextLinkInput[];
  bannerLinks: BannerLinkInput[];
  categories: CategoryOption[];
  resident?: ResidentPersona;
}

export function buildOutlinePrompt(input: OutlinePromptInput): { system: string; prompt: string } {
  const { source, wordCount, textLinks, bannerLinks, categories, resident } = input;
  const { h2Count, h3PerH2 } = computeOutlinePlan(wordCount);
  const hasAffiliateLinks = textLinks.length > 0 || bannerLinks.length > 0;

  const textLinkItems = textLinks
    .map(
      (link, i) =>
        `${i + 1}. [テキストリンク / 目印 ${textLinkPlaceholder(i)}] URL: ${link.url}${
          link.info ? `\n   スクレイピングで取得した情報: ${link.info}` : ""
        }`
    )
    .join("\n");
  const bannerLinkItems = bannerLinks
    .map(
      (link, i) =>
        `${i + 1}. [バナーリンク / 目印 ${bannerLinkPlaceholder(i)}] ${
          link.note ? `概要: ${link.note}` : "(概要情報なし。バナー画像自体に商品情報が含まれる想定)"
        }`
    )
    .join("\n");

  const affiliateSection = hasAffiliateLinks
    ? `
【アフィリエイトリンク一覧(合計${textLinks.length + bannerLinks.length}本)】
${[textLinkItems, bannerLinkItems].filter(Boolean).join("\n")}

各テキストリンクのURL自体についてもGoogle検索を実行し、紹介されている商品・サービスの特徴、ユーザーのメリット、訴求ポイントを調査してください(バナーリンクはURLが無いため、概要のみを手がかりに関連性の高いセクションを判断してください)。

【厳守:ハルシネーション禁止】
- 商品・サービスに関する記述は、上記のスクレイピング情報、または検索で実際にヒットしたページの内容に基づく事実のみを用いてください。学習知識からの推測や一般論での穴埋めは禁止です。
- 価格・スペック・キャンペーン内容・在庫状況・実績数値など、出典で確認できない具体的な数値や条件を創作することは絶対に禁止です。
- 出典間で情報が食い違う場合は、より確度の高い一次情報(スクレイピング情報・公式URL)を優先してください。
- 確証が持てない情報は断定せず、「詳細は公式サイトでご確認ください」等、事実に基づかない誇張を避けた表現にとどめてください。
- URL先の情報が乏しい場合は、無理に詳細を作り出さず、確認できた範囲の事実だけを簡潔にまとめてください。

【記事テーマとの整合性】
- アフィリエイト商品は、必ずソース情報・記事タイトルのテーマに関連付けて紹介してください。商品単体の宣伝文を唐突に挿入するのではなく、「記事で扱っている悩み・話題に対する選択肢・解決策」として自然に位置づけてください。
- アフィリエイト商品を紹介するセクションのpurpose/keyPointsには、記事全体のテーマと商品の関連性が明確にわかるように記述してください。
- リンクのセット(またはペアを組めない単体リンク)が複数ある場合は、セットごと・単体リンクごとに、できるだけ異なるH2/H3セクションに分散して配置してください。特定の1セクションに複数のセット・複数のリンクを詰め込まないこと。

【バナーリンクとテキストリンクのセット配置(該当する場合は厳守)】
- テキストリンクとバナーリンクの両方が指定されており、入力順が同じもの(1本目のテキストリンクと1本目のバナーリンク、2本目同士…)がある場合、それらは同一商品・サービスを指すセットとして扱ってください。
- セットになっている場合は、対応する2つのaffiliateNotesエントリの両方に「これはセットであること」と「両方の目印文字列(バナー側の目印文字列→テキスト側の目印文字列の順)」を明記し、本文では同じセクション内に隣接して配置する計画にしてください(セットを分割して別セクションに置いたり、間に他の内容を挟んだりする計画は禁止です)。
- 本数が揃わずセットを組めないリンクが余る場合は、そのリンク単体として扱い、関連性の高いセクションへ個別に配置してください。
- 目印文字列は執筆時に本文中で独立した段落として挿入されます。affiliateNotesには「どのセクションで・どんな文脈で・何のために紹介するか」を書き、「文中に埋め込む」「段落の途中に差し込む」といった配置指示は書かないでください。
`
    : "";

  const system = `あなたはSEOに精通したプロのコンテンツストラテジスト兼リサーチャーです。
Google検索を使って、与えられたキーワード・ソース情報に関する最新の事実(データ・日付・トレンド)を調査した上で、検索上位を狙えるブログ記事の構成案と、執筆モデルがそのまま使えるファクトシートを生成してください。
今日の日付は${formatJapaneseDate()}です。情報の新しさを判断する際の基準にしてください。

${buildSiteConcept(resident)}
${buildCategorySection(categories)}
出力は必ず以下のフォーマットに従った純粋なJSONのみとしてください。
マークダウンコードブロック(\`\`\`json等)は含めないでください。

${OUTLINE_FORMAT}

【重要な設計指針】
- 上記「サイトのコンセプト・発信者像・読者ターゲット」を最優先で反映すること。ソース情報のジャンルが何であっても、構成は「未経験・異業種からIT転職を目指す読者」に向けたものにし、タイトル・見出し・purpose・keyPoints・conclusion のすべてをその視点で設計すること
- 少なくとも1つのH2は「この話題が、未経験からIT転職を目指す読者にとって何を意味するか／読者が次に取るべき具体的アクション」を扱う内容にすること(生活・時事ネタの場合は、読者の暮らし・将来設計にとっての意味を扱ってよい)
- SEOキーワードを自然に盛り込んだ魅力的なタイトルを設定すること(ターゲット読者が検索しそうな語を意識する)
- 読者が「これを読めば解決する」と感じるような構成にすること
- 吹き出しの感情(toneNote)は多様に設定し、単調にならないようにすること
- H2は${h2Count}個程度、各H2にH3を${h3PerH2}個程度配置すること(目標文字数${wordCount}文字に対して過不足のない構成にすること。個数を過剰に増やさないこと)。最後のH2は「まとめ」とするため、H2の個数にはまとめを含めない
- researchFactsには、推測や一般論ではなくGoogle検索で確認した具体的な事実を反映すること
${
  hasAffiliateLinks
    ? "- 上記アフィリエイトリンク一覧の各リンクについて、affiliateNotesに1本につき1つの文字列で挿入計画を記述し、対応する目印文字列を必ずそのままの形で含めること(URL・アンカーテキスト・バナーコードそのものは書かないこと)"
    : ""
}`;

  const prompt = `以下のソース情報について、まずGoogle検索で最新情報を調査してから、記事構成案とファクトシートを生成してください。

【ソース情報】
${source}
${affiliateSection}`;

  return { system, prompt };
}

// ─── Stage 2: 本文執筆プロンプト ───────────────────────────────────────────

/** 構成案(実際に生成/編集されたH2・H3の個数)から、1H3あたりの目安文字数の算出に使う個数を求める。 */
function estimateSubsectionCount(outlineJson: string | undefined, wordCount: number): number {
  if (outlineJson) {
    try {
      const sections = JSON.parse(outlineJson)?.sections;
      if (Array.isArray(sections) && sections.length > 0) {
        const total = sections.reduce((sum: number, s: { subsections?: unknown[] }) => {
          const subCount = Array.isArray(s?.subsections) ? s.subsections.length : 0;
          return sum + (subCount > 0 ? subCount : 1);
        }, 0);
        if (total > 0) return total;
      }
    } catch {
      // 構成案JSONが壊れている場合はフォールバックする
    }
  }
  const plan = computeOutlinePlan(wordCount);
  return plan.h2Count * plan.h3PerH2;
}

export interface ArticlePromptInput {
  source: string;
  wordCount: number;
  modelId: string;
  outlineJson?: string;
  additionalInstruction?: string;
  textLinks: TextLinkInput[];
  bannerLinks: BannerLinkInput[];
  /** 追加指示で修正する、現在の記事全文(Markdown) */
  currentArticle?: string;
  resident?: ResidentPersona;
}

export interface ArticlePrompt {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}

export function buildArticlePrompt(input: ArticlePromptInput): ArticlePrompt {
  const { source, wordCount, modelId, outlineJson, additionalInstruction, textLinks, bannerLinks, currentArticle, resident } =
    input;

  const outlineSection = outlineJson
    ? `
【記事構成案(必ずこの構成に従って執筆してください)】
${outlineJson}
`
    : "";

  const hasAffiliateLinks = textLinks.length > 0 || bannerLinks.length > 0;
  const markers = [
    ...textLinks.map((_, i) => `${textLinkPlaceholder(i)}(テキストリンク)`),
    ...bannerLinks.map((_, i) => `${bannerLinkPlaceholder(i)}(バナーリンク)`),
  ];

  // テキストリンクとバナーリンクは、入力順が同じもの同士(1本目と1本目…)を同一商品・サービスの
  // セットとして扱い、本文中でも分離させずバナー→テキストの順で隣接させる。
  const pairCount = Math.min(textLinks.length, bannerLinks.length);
  const pairedSetsText = Array.from({ length: pairCount }, (_, i) => {
    return `  - セット${i + 1}: ${bannerLinkPlaceholder(i)}(上) + ${textLinkPlaceholder(i)}(下)`;
  }).join("\n");

  const affiliateSection = hasAffiliateLinks
    ? `
【アフィリエイトリンク(目印文字列の取り扱い厳守)】
今回使用できる目印文字列: ${markers.join(", ")}
${
  pairCount > 0
    ? `
■ バナー＋テキストのセット配置(該当するセットは必ず厳守)
以下は同一商品・サービスを指すセットです。セットになっている2つの目印文字列は絶対に分離せず、必ず隣接させて配置してください(間に他の文章・見出し・別のリンクを挟むことや、順番を入れ替えることは禁止):
${pairedSetsText}
- セットは「1行目にバナーリンクの目印文字列」「その直下の2行目にテキストリンクの目印文字列」の順で、空行を挟まず2行続けた1つの独立した段落として出力してください。他の文言・記号は加えないこと:
  ${bannerLinkPlaceholder(0)}
  ${textLinkPlaceholder(0)}
- 上記に含まれないリンク(ペアを組めなかった単体のテキストリンク・バナーリンク)は、下記の単体配置ルールに従ってください。`
    : ""
}
- 構成案(affiliateNotes)で指定された位置に、対応する目印文字列をそのままの形で本文中に過不足なく1回ずつ挿入してください(登場させ忘れ・重複挿入は禁止)。
- セットを組んでいない単体の目印文字列は、「それ専用の独立した1つの段落」に、目印文字列だけを入れて配置してください(前後は空行)。本文・説明文や、リスト・表・囲み(>)の中には混在させないでください。
- リンクを入れたい流れが文章の途中に来る場合は、いったんその段落を終えてから(空行を入れてから)目印文字列の段落を挿入し、その次から新しい段落を始めてください。段落の途中に目印文字列を差し込むことは禁止です。
- 目印文字列の前後に、[ ]( ) のリンク記法・画像記法・「PR」「広告」などのラベル・リンクの見出し文言を、自分で作成して付け加えないでください。目印文字列だけを置けば、後で自動的にASPから提供された元のリンク・バナーへ一切の改変なく置き換わります。目印文字列自体を書き換えたり、周囲に余計な記法を加えたりすると、表示崩れやASP規約違反の原因になるため絶対に行わないでください。
- 【厳禁:二重リンク化】本文中(特に「現在の記事全文」を修正する場合)に、目印文字列ではなく既に展開済みのリンク([テキスト](URL) や [![](画像URL)](URL))がある場合、それは既に完成した1つの部品です。一字一句変更せずそのままの位置に残し、新たなリンク記法でさらに囲まないでください。
- リンクへ誘導する一言(例: 「詳しくはこちらをご確認ください」)を添えたい場合は、目印文字列の段落の【直前】に、独立した通常の段落として書いてください。その誘導文の中には目印文字列を含めないこと。
- 目印文字列自体を消去する、別の文言に置き換える、一部だけ抜き出す、日本語訳や説明に変換するなどの改変は絶対に禁止です。
- アフィリエイト商品・サービスについて記述する際は、必ず構成案(researchFacts・affiliateNotes)に記載された事実の範囲内で書いてください。構成案に書かれていない価格・スペック・特典・数値などを新たに創作することは禁止です。
- 各商品紹介は記事タイトル・全体テーマと関連づけ、直前までの文脈から自然に繋がる形で導入し、話題が唐突に脱線しないようにしてください。
`
    : "";

  const outputContract = `
【出力についての厳守事項】
- 出力はそのままこのブログの本文(Markdown)として保存されます。前置き・後書き・説明文・Markdown全体を囲むコードフェンスは一切含めないでください。
- 出力の1文字目から本文(導入の段落)で始まり、最後の吹き出しまで完結した1つの記事にしてください。文の途中や記法の途中から始まる/終わることは絶対に禁止です。
- 「続きです」「前回の内容を踏まえ」等、会話の継続を示す言葉は出力に含めないでください。読者はこの出力しか読みません。`;

  const subsectionCount = estimateSubsectionCount(outlineJson, wordCount);
  const perSectionChars = Math.max(200, Math.round((wordCount * 0.8) / subsectionCount));
  const minWordCount = Math.round(wordCount * 0.9);
  const maxWordCount = Math.round(wordCount * 1.1);

  // 途中で息切れして省略・要約してしまうのを防ぎつつ、目標を大きく超えて書き続けて
  // 出力上限で打ち切られる事故も防ぐための明示指示。
  const noTruncationContract = `
【厳守:後半の省略・要約の禁止】
- 構成案に記載されたすべての見出し(H2・H3)を、最初から最後まで一つも省略せずに執筆してください。目標文字数に届きそうにないからといって、残りの見出しを箇条書きやまとめだけで済ませることは禁止です。
- 記事の前半と後半で解説のボリューム・具体性に差が出ないよう、各見出しへ均等に情報量を配分してください。
- 目標文字数(${wordCount}文字、許容範囲${minWordCount}〜${maxWordCount}文字)に達したら、それ以上書き続けずそこで締めくくってください。目標を大きく超えて書き続けることは、文字数不足と同じく禁止です。`;

  // 一部モデル(例: Claude Haiku)は目標文字数を大幅に超過しやすいため、該当モデルにだけ追加で強い指示を入れる。
  const verbosityGuardContract = isVerbosityRiskModel(modelId)
    ? `
【特に重要:出力の膨張を防ぐための厳格ルール】
- 1つのH3見出しの解説を書く際、${perSectionChars}文字程度を明確に超えたと感じた時点で、そのH3はすぐに区切って次の見出しに進んでください。
- 現在までに書いた合計文字数が目標文字数(${maxWordCount}文字)に達した場合、まだ執筆していない見出しが残っていても、それ以上の本文追加より先に「まとめ」で記事を締めくくることを優先してください。
- 一つの具体例や理由につき1〜2文で述べたら次へ進み、同じ理由を別の言い回しで何度も説明し直さないでください。`
    : "";

  const system = `あなたはプロのSEOライター兼編集者です。以下のサイトコンセプトと出力仕様を完璧に遵守して、目標文字数にふさわしい情報量と読者満足度を誇るブログ記事を作成してください。
今日の日付は${formatJapaneseDate()}です。

${buildSiteConcept(resident)}

上記のサイトコンセプト・発信者像・読者ターゲットを、記事全体で一貫して守ってください。ソース情報のジャンルが何であっても、記事は「未経験・異業種からIT転職を目指す読者」に向けて書き、話題を最終的に「読者にとっての意味」「次に取るべき行動」へ落とし込みます。専門用語には必ずかみ砕いた補足を添えます。

${MARKDOWN_GUIDELINES}
${ARTICLE_STRUCTURE_RULES}

【最優先事項】
1. 目標文字数の厳守:
   - 目標文字数は${wordCount}文字です。実際の出来上がり(吹き出しの台詞を含む地の文の文字数)が${minWordCount}〜${maxWordCount}文字程度(目標の±10%以内)に収まるように調整してください。大きく超過させることも、大きく不足させることも禁止です。
   - 目安として、各H3見出しの解説は${perSectionChars}文字程度にしてください。内容が薄く目安に届かない場合のみ、具体例や背景を補ってください。目安に達したら、そのセクションはそこで区切ってください。
   - 同じ内容・結論・フレーズを別のセクションで繰り返して文字数を稼ぐことは厳禁です。

2. 吹き出しの交互出力:
   - 吹き出しパートでは、必ず「hukidasi1(メイン)」と「hukidasi2(パートナー)」を交互に出現させ、自然な対話(掛け合い)を成立させてください。
   - 各吹き出しに emotion="..." 属性を必ず付与してください。
${noTruncationContract}
${verbosityGuardContract}

指示内容:
- ソース情報: ${source}
${outlineSection}${affiliateSection}
- 言語: 日本語
${outputContract}`;

  // 「現在の記事全文」には展開済みの実URL・バナーが入っているため、AIに見せる前に目印文字列へ戻す。
  const maskedCurrentArticle = currentArticle ? maskAffiliateLinks(currentArticle, textLinks, bannerLinks) : currentArticle;

  let prompt: string;
  if (additionalInstruction && maskedCurrentArticle) {
    prompt = `以下は現在のブログ記事の全文(Markdown)です。

【現在の記事全文】
${maskedCurrentArticle}

【追加指示】
${additionalInstruction}

上記の追加指示だけを反映するように、現在の記事全文を修正してください。
- 指示と無関係な見出し・段落・吹き出しは、内容を変えずにそのまま維持してください(書き直して言い回しを変えるのは禁止)。
- 修正後の記事の「全文」を、先頭から末尾まで省略せずに出力してください。差分やコメントだけを返すのは禁止です。
- 構成案の見出し構成を崩さないでください。既存の吹き出しの記法(emotion や icon_url の属性)もそのまま維持してください。
- 文中に \`@@AFFILIATE_\` で始まる目印文字列がある場合は、一字一句変えずにそのままの位置・回数で残してください(削除・言い換え・移動は禁止です)。
- 展開済みのリンク([テキスト](URL) や [![](画像URL)](URL))が残っている場合も、一字一句変えずにそのままの位置に残してください。新たなリンク記法でさらに囲むことは禁止です。`;
  } else if (additionalInstruction) {
    prompt = `追加指示: ${additionalInstruction}\nこれに基づいて記事を生成してください。`;
  } else {
    prompt = `上記指示に従い、記事を生成してください。`;
  }

  // 出力トークンの上限は「打ち切られないための安全マージン」であり、実際に狙う文字数はプロンプト側で制御している。
  // Markdownは装飾が少ないため、日本語1文字≒1〜2トークンで見積もる。追加指示で全文を再出力する場合は既存記事の長さも下限に含める。
  const MIN_OUTPUT_TOKENS = 8192;
  const baseTokens = Math.max(12288, Math.ceil(wordCount * 2.5));
  const rewriteTokens = currentArticle ? Math.ceil(currentArticle.length * 2) + 2048 : 0;
  const ceiling = getMaxOutputTokensForModel(modelId);
  const maxOutputTokens = Math.min(ceiling, Math.max(MIN_OUTPUT_TOKENS, baseTokens, rewriteTokens));

  return { system, prompt, maxOutputTokens };
}

/** maxOutputTokensによる打ち切りからの自動リカバリ用。末尾を手がかりに、続きだけを生成させる。 */
export function buildContinuationPrompt(tailText: string): string {
  return `直前の出力は割り当てられた上限に達したため、途中で切れてしまいました。以下はその末尾の抜粋です。

【出力済み本文の末尾(この続きから書いてください)】
${tailText}

【指示】
- 上記の続きから執筆を再開してください。文や記法(吹き出し・表・囲みなど)が途中で切れている場合は、まずそれを自然に補って完成させてから続けてください。
- これまでに書いた内容・見出し・段落を繰り返さないでください。
- 元の指示にあった構成案の残りの見出しを、最初の指示と同じトーン・品質・詳しさで最後まで執筆してください(最後は「まとめ」と、hukidasi1の応援の吹き出しで締めくくる)。
- 「続きです」「前回の内容を踏まえ」等、会話の継続を示す言葉は出力に含めないでください。この出力はそのまま直前の本文の末尾に連結されます。`;
}

// ─── SEOタイトル・メタディスクリプション・タグ ─────────────────────────────

export function buildSeoMetaPrompt(articleMarkdown: string): { system: string; prompt: string } {
  const plainText = markdownToPlainText(articleMarkdown).slice(0, 6000);

  const system = `あなたは日本語のSEOに精通した編集者です。与えられたブログ記事の本文から、検索クリック率を高めるSEOタイトルとメタディスクリプション、および記事のタグ候補を考えてください。
【出力形式(厳守)】
必ず次のJSON形式のみを出力してください。前置き・説明文・Markdownのコードフェンス(\`\`\`json等)は一切含めないでください。
{"title": "SEOタイトル(30〜60文字。記事内容を的確に表し、検索されそうなキーワードを含む)", "metaDescription": "メタディスクリプション(120〜155文字。記事の要点を要約し、検索結果でのクリックを誘う文章)", "tags": ["記事内容を表す名詞句を5個程度。1〜2語程度で簡潔に。記号(#等)は付けない"]}`;

  return { system, prompt: `【記事本文(抜粋)】\n${plainText}` };
}

// ─── アイキャッチ画像のプロンプト ───────────────────────────────────────────

export function buildEyecatchPromptRequest(source: string, outlineJson?: string): { system: string; prompt: string } {
  let outlineSummary = "";
  if (outlineJson) {
    try {
      const parsed = JSON.parse(outlineJson);
      const headings = Array.isArray(parsed?.sections)
        ? parsed.sections
            .map((s: { h2?: string }) => s?.h2)
            .filter(Boolean)
            .join(" / ")
        : "";
      outlineSummary = [parsed?.title, parsed?.metaDescription, headings].filter(Boolean).join("\n");
    } catch {
      // 構成案JSONが壊れている場合はソースのみで組み立てる
    }
  }

  // 画像生成モデルは英語プロンプトの方が意図通りの構図・画質になりやすいため、英語で出力させる。
  const system = `あなたはブログ記事のアイキャッチ画像を発注するアートディレクターです。与えられた記事テーマから、画像生成AIに渡すための英語の指示文を1つだけ考えてください。
【条件】
- ブログ「レジリエンサーCafe」は、温かみのあるカフェのような雰囲気(ベージュ・ブラウン・オレンジ系の暖色)のサイトです。画像もその雰囲気になじむ、親しみやすいイラスト調・やわらかい配色を基本にすること
- 記事の内容に合っていて目を引く効果があると判断した場合は、その内容にふさわしい人物やキャラクター(サイト固有のものではなく、テーマに即した一般的なイラスト調の人物・キャラクター)を登場させてよい。人物がなくても内容が伝わる構図であれば、背景やオブジェクト中心でもよい
- 登場させる場合は、画風・構図・雰囲気を記事テーマに合わせて具体的に指示すること
- 記事の内容・トーンに合った、クリックしたくなる目を引く背景・構図にすること
- 文字・ロゴ・実在の人物の顔・実在ブランド名は画像に含めないこと
- 横長のブログのアイキャッチ画像として自然な構図(16:9)を意識すること
- 出力は英語の指示文のみとし、前置き・説明・引用符・Markdownは一切含めないこと`;

  return { system, prompt: `【記事テーマ】\n${outlineSummary || source}` };
}

export const EYECATCH_PROMPT_SUFFIX =
  "Landscape 16:9 composition suitable for a blog article's eyecatch thumbnail. Do not include any on-image text, logos, real people's faces, or real brand names.";
