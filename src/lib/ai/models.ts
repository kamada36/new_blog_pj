// AI記事生成(/admin/generate)・AIリライト(/admin/rewrite)で選べるモデルのカタログ。
// reference-tools/blog2 の models.ts と reference-tools/WP_Rewrite_PJ の gemini-pricing.ts を統合したもの。
// モデルIDや料金が変わったときは、この配列だけを更新すればよい。

export type Provider = "gemini" | "claude";

export type GeminiThinkingConfig =
  | { thinkingBudget: number }
  | { thinkingLevel: "minimal" | "low" | "medium" | "high" };

export interface ModelDef {
  id: string;
  provider: Provider;
  name: string;
  /** USD / 100万トークン */
  inputPricePerM: number;
  outputPricePerM: number;
  note?: string;
  /** ストリーミング時に受け付ける出力トークンの実際の上限。未設定ならプロバイダー既定値を使う。 */
  maxOutputTokens?: number;
  /**
   * Geminiの思考設定。未設定時は { thinkingBudget: 0 }(思考無効)。
   * Pro系は思考を完全には無効化できず、budget:0を渡すとAPIエラーで本文が1文字も出ないため明示的に指定する。
   */
  geminiThinkingConfig?: GeminiThinkingConfig;
  /** 目標文字数への追従が弱く出力が膨らみやすいモデル。追加の文字数ガードと継続生成のハードキャップを有効にする。 */
  verbosityRisk?: boolean;
}

export const MODELS: ModelDef[] = [
  {
    id: "gemini-3.1-pro-preview",
    provider: "gemini",
    name: "Gemini 3.1 Pro",
    inputPricePerM: 2.0,
    outputPricePerM: 12.0,
    note: "高品質な構成案生成向け",
    geminiThinkingConfig: { thinkingLevel: "low" },
  },
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    name: "Gemini 3.6 Flash",
    inputPricePerM: 0.75,
    outputPricePerM: 3.75,
    note: "リライトの標準モデル。品質とコストのバランスが良い",
  },
  {
    id: "gemini-3.6-flash-lite",
    provider: "gemini",
    name: "Gemini 3.6 Flash-Lite",
    inputPricePerM: 0.3,
    outputPricePerM: 2.5,
    note: "低コスト。料金は公式の3.5 Flash-Liteを暫定値として使用",
  },
  {
    id: "gemini-3.5-flash",
    provider: "gemini",
    name: "Gemini 3.5 Flash",
    inputPricePerM: 1.5,
    outputPricePerM: 9.0,
    note: "構成案生成の標準モデル",
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "gemini",
    name: "Gemini 3.1 Flash-Lite",
    inputPricePerM: 0.25,
    outputPricePerM: 1.5,
    note: "本文執筆の標準モデル(低コスト)",
  },
  {
    id: "claude-opus-4-8",
    provider: "claude",
    name: "Claude Opus 4.8",
    inputPricePerM: 15.0,
    outputPricePerM: 75.0,
    note: "最高品質(高コスト)",
    maxOutputTokens: 128000,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "claude",
    name: "Claude Sonnet 4.6",
    inputPricePerM: 3.0,
    outputPricePerM: 15.0,
    note: "高品質・バランス型",
    maxOutputTokens: 128000,
  },
  {
    id: "claude-haiku-4-5",
    provider: "claude",
    name: "Claude Haiku 4.5",
    inputPricePerM: 0.8,
    outputPricePerM: 4.0,
    note: "高速・低コスト",
    maxOutputTokens: 64000,
    verbosityRisk: true,
  },
];

export const DEFAULT_OUTLINE_MODEL = "gemini-3.5-flash";
export const DEFAULT_ARTICLE_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_REWRITE_MODEL = "gemini-3.6-flash";

/** 構成案生成はGoogle Search Grounding(Gemini専用)を使うため、Geminiモデルだけが対象。 */
export const OUTLINE_MODELS = MODELS.filter((m) => m.provider === "gemini");

export function getModel(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}

/** カタログ外のIDでも、接頭辞からプロバイダーを推定する。 */
export function getProviderForModel(modelId: string): Provider {
  const known = getModel(modelId);
  if (known) return known.provider;
  return modelId.startsWith("claude") ? "claude" : "gemini";
}

export function getMaxOutputTokensForModel(modelId: string): number {
  const known = getModel(modelId);
  if (known?.maxOutputTokens) return known.maxOutputTokens;
  return getProviderForModel(modelId) === "claude" ? 128000 : 32768;
}

export function getGeminiThinkingConfig(modelId: string): GeminiThinkingConfig {
  return getModel(modelId)?.geminiThinkingConfig ?? { thinkingBudget: 0 };
}

export function isVerbosityRiskModel(modelId: string): boolean {
  return getModel(modelId)?.verbosityRisk === true;
}
