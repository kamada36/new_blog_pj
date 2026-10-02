import { getModel } from "./models";

// 表示専用の固定為替レート。実際のレートとズレてきたらここを更新する。
export const JPY_RATE = 155;
// 日本語混じりテキストの概算(1トークンあたりの文字数)。厳密な課金額ではなく予算の目安。
const CHARS_PER_TOKEN = 1.5;

// ガイドライン・サイトコンセプト等の固定プロンプトの文字数(概算)
const STATIC_PROMPT_CHARS = 5200;
const OUTLINE_OUTPUT_TOKENS = 2400;

// アイキャッチ画像1枚あたりの概算コスト(gemini-3.1-flash-image、1K解像度)。
export const EYECATCH_IMAGE_COST_USD = 0.067;

export interface GenerateCostEstimate {
  stage1CostUsd: number;
  stage2CostUsd: number;
  imageCostUsd: number;
  totalCostUsd: number;
  totalCostJpy: number;
}

export function estimateGenerateCost(
  outlineModelId: string,
  articleModelId: string,
  sourceChars: number,
  targetWordCount: number,
  withEyecatch: boolean
): GenerateCostEstimate {
  const outlineModel = getModel(outlineModelId);
  const articleModel = getModel(articleModelId);

  const stage1InputTokens = Math.ceil((STATIC_PROMPT_CHARS + sourceChars) / CHARS_PER_TOKEN);
  const stage2InputTokens = Math.ceil(
    (STATIC_PROMPT_CHARS + sourceChars) / CHARS_PER_TOKEN + OUTLINE_OUTPUT_TOKENS
  );
  // Markdownは装飾が少ないため、出力トークン数は目標文字数にほぼ比例する。
  const stage2OutputTokens = Math.ceil(targetWordCount / CHARS_PER_TOKEN);

  const stage1CostUsd = outlineModel
    ? (stage1InputTokens * outlineModel.inputPricePerM + OUTLINE_OUTPUT_TOKENS * outlineModel.outputPricePerM) /
      1_000_000
    : 0;
  const stage2CostUsd = articleModel
    ? (stage2InputTokens * articleModel.inputPricePerM + stage2OutputTokens * articleModel.outputPricePerM) /
      1_000_000
    : 0;
  const imageCostUsd = withEyecatch ? EYECATCH_IMAGE_COST_USD : 0;
  const totalCostUsd = stage1CostUsd + stage2CostUsd + imageCostUsd;

  return { stage1CostUsd, stage2CostUsd, imageCostUsd, totalCostUsd, totalCostJpy: totalCostUsd * JPY_RATE };
}

const REWRITE_PROMPT_CHARS = 2600;

/** 1記事のリライトにかかる概算コスト。出力は元記事とほぼ同じ長さと仮定する。 */
export function estimateRewriteCost(
  modelId: string,
  articleChars: number,
  extraPromptChars = 0
): { totalCostUsd: number; totalCostJpy: number; totalTokens: number } {
  const model = getModel(modelId);
  const inputTokens = Math.ceil((articleChars + extraPromptChars + REWRITE_PROMPT_CHARS) / CHARS_PER_TOKEN);
  const outputTokens = Math.ceil((articleChars + 200) / CHARS_PER_TOKEN);
  const totalCostUsd = model
    ? (inputTokens * model.inputPricePerM + outputTokens * model.outputPricePerM) / 1_000_000
    : 0;
  return { totalCostUsd, totalCostJpy: totalCostUsd * JPY_RATE, totalTokens: inputTokens + outputTokens };
}

export function formatJpy(jpy: number): string {
  if (jpy < 1) return `約¥${jpy.toFixed(2)}`;
  if (jpy < 10) return `約¥${jpy.toFixed(1)}`;
  return `約¥${Math.round(jpy)}`;
}
