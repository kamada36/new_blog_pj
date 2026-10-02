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
  // ── Gemini(新しい順)。料金は公式の標準(Standard)有料枠。2026-10確認 ──
  {
    id: "gemini-3.8-flash",
    provider: "gemini",
    name: "Gemini 3.8 Flash",
    inputPricePerM: 0.75,
    outputPricePerM: 3.75,
    note: "最新のFlash。長時間のコーディング・エージェント向け。料金は2026年末までの導入価格(2027年からは約2倍)",
  },
  {
    id: "gemini-3.7-flash",
    provider: "gemini",
    name: "Gemini 3.7 Flash",
    inputPricePerM: 0.75,
    outputPricePerM: 3.75,
    note: "複雑なコーディング・エージェント向け。導入価格(2026年末まで)",
  },
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    name: "Gemini 3.6 Flash",
    inputPricePerM: 0.75,
    outputPricePerM: 3.75,
    note: "速度とマルチモーダルのバランス型。導入価格(2026年末まで)",
  },
  {
    id: "gemini-3.5-flash",
    provider: "gemini",
    name: "Gemini 3.5 Flash",
    inputPricePerM: 1.5,
    outputPricePerM: 9.0,
    note: "旧世代のFlash(定常的な処理向け)",
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    name: "Gemini 3.5 Flash-Lite",
    inputPricePerM: 0.3,
    outputPricePerM: 2.5,
    note: "3.5世代で最速・低コスト",
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "gemini",
    name: "Gemini 3.1 Flash-Lite",
    inputPricePerM: 0.25,
    outputPricePerM: 1.5,
    note: "最安クラス。本文執筆の標準モデル",
  },
  {
    id: "gemini-3.1-pro-preview",
    provider: "gemini",
    name: "Gemini 3.1 Pro (Preview)",
    inputPricePerM: 2.0,
    outputPricePerM: 12.0,
    note: "高品質な構成案生成向け(プレビュー版)",
    geminiThinkingConfig: { thinkingLevel: "low" },
  },
  // ── Claude(新しい順)。料金はAnthropic APIの標準料金。2026-09確認 ──
  // Fable 5.1 / Opus 5.5 / Sonnet 5.5 は思考が常時オン(thinkingパラメータは送らない)。思考トークンも出力上限に含まれる。
  {
    id: "claude-fable-5-1",
    provider: "claude",
    name: "Claude Fable 5.1",
    inputPricePerM: 10.0,
    outputPricePerM: 50.0,
    note: "最高性能(高コスト)。データ保持30日の設定が必要",
    maxOutputTokens: 128000,
  },
  {
    id: "claude-opus-5-5",
    provider: "claude",
    name: "Claude Opus 5.5",
    inputPricePerM: 4.0,
    outputPricePerM: 20.0,
    note: "最新のOpus。高品質な執筆・構成案向け",
    maxOutputTokens: 128000,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "claude",
    name: "Claude Sonnet 5.5",
    inputPricePerM: 2.0,
    outputPricePerM: 10.0,
    note: "最新のSonnet。品質とコストのバランス型",
    maxOutputTokens: 128000,
  },
  {
    id: "claude-opus-5",
    provider: "claude",
    name: "Claude Opus 5",
    inputPricePerM: 5.0,
    outputPricePerM: 25.0,
    note: "ひとつ前のOpus",
    maxOutputTokens: 128000,
  },
  {
    id: "claude-opus-4-8",
    provider: "claude",
    name: "Claude Opus 4.8",
    inputPricePerM: 5.0,
    outputPricePerM: 25.0,
    maxOutputTokens: 128000,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "claude",
    name: "Claude Sonnet 4.6",
    inputPricePerM: 3.0,
    outputPricePerM: 15.0,
    maxOutputTokens: 128000,
  },
  {
    id: "claude-haiku-4-5",
    provider: "claude",
    name: "Claude Haiku 4.5",
    inputPricePerM: 1.0,
    outputPricePerM: 5.0,
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
