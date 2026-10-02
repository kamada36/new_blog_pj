import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, generateText, streamText, type LanguageModel } from "ai";
import { getGeminiThinkingConfig, getModel, getProviderForModel, type Provider } from "./models";

/** APIキー未設定など、運用者が環境変数を直せば解消する設定エラー。 */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

// ─── モデルの解決 ─────────────────────────────────────────────────────────

export function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AiConfigError("GEMINI_API_KEY が設定されていません。.env に追加してください。");
  return key;
}

export function resolveLanguageModel(modelId: string): { provider: Provider; model: LanguageModel } {
  const provider = getProviderForModel(modelId);

  if (provider === "claude") {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new AiConfigError(
        `モデル「${getModel(modelId)?.name ?? modelId}」の利用には ANTHROPIC_API_KEY が必要です。.env に追加するか、Geminiモデルを選んでください。`
      );
    }
    return { provider, model: createAnthropic({ apiKey })(modelId) };
  }

  return { provider, model: createGoogleGenerativeAI({ apiKey: requireGeminiKey() })(modelId) };
}

/** Gemini 3系は既定で内部思考が有効で、可視テキストが出るまで長く無出力になる。本文執筆では思考を最小化する。 */
export function providerOptionsFor(modelId: string) {
  return getProviderForModel(modelId) === "gemini"
    ? { google: { thinkingConfig: getGeminiThinkingConfig(modelId) } }
    : undefined;
}

// ─── エラー ───────────────────────────────────────────────────────────────

/** 429/RESOURCE_EXHAUSTEDはクォータ超過。サーバーが指定するretryDelayまで待たないと解消しないことが多い。 */
function isQuotaExhausted(error: APICallError): boolean {
  if (error.statusCode === 429) return true;
  return (error.data as { error?: { status?: string } } | undefined)?.error?.status === "RESOURCE_EXHAUSTED";
}

/** 503/UNAVAILABLEや一時的な5xxは、短い待機を挟んで再試行すれば解消することが多い。 */
function isTransientOverload(error: APICallError): boolean {
  const status = error.statusCode;
  return status === 503 || (status !== undefined && status >= 500);
}

/** エラー本文の details[].retryDelay(例: "51.850000000s")から待機すべきミリ秒を取り出す。 */
function getSuggestedRetryDelayMs(error: APICallError): number | undefined {
  const details = (error.data as { error?: { details?: { "@type"?: string; retryDelay?: string }[] } } | undefined)?.error
    ?.details;
  if (!Array.isArray(details)) return undefined;
  const retryInfo = details.find((d) => typeof d?.["@type"] === "string" && d["@type"].includes("RetryInfo"));
  const match = retryInfo?.retryDelay?.match(/^([\d.]+)s$/);
  if (!match) return undefined;
  const seconds = parseFloat(match[1]);
  return Number.isNaN(seconds) ? undefined : seconds * 1000;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "ResponseAborted");
}

/** 画面に出す日本語のエラーメッセージに変換する。 */
export function describeAiError(error: unknown, modelId?: string): string {
  if (error instanceof AiConfigError) return error.message;
  if (isAbortError(error)) return "生成を中断しました。";

  if (APICallError.isInstance(error)) {
    if (isQuotaExhausted(error)) {
      return "AI APIのレート制限(利用上限)に達しました。しばらく待ってから再試行するか、別のモデルを選んでください。";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "AI APIキーが無効、または権限がありません。.env のAPIキーを確認してください。";
    }
    if (error.statusCode === 404) {
      return `モデル「${modelId ?? "指定のモデル"}」が利用できません。別のモデルを選ぶか、src/lib/ai/models.ts のモデルIDを更新してください。`;
    }
    if (isTransientOverload(error)) {
      return "AI APIが混雑しています(一時的なサーバーエラー)。時間をおいて再試行してください。";
    }
    return `AI APIエラー: ${error.message}`;
  }

  return error instanceof Error ? error.message : "不明なエラーが発生しました。";
}

// ─── ストリーミング生成 ───────────────────────────────────────────────────

// サーバー混雑(503)・クォータ超過(429)の再試行。初回失敗後、最大3回まで、2秒→4秒→8秒と待機を延ばす。
// モデルはコスト・品質が変わるため切り替えず、選択されたモデルのまま再試行する。
// ストリーミング開始後(最初のチャンクを受け取った後)の失敗は、送信済みテキストを重複させずに
// やり直す手段が無いため再試行しない。
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_QUOTA_WAIT_MS = 60_000;

interface TextStreamLike {
  textStream: AsyncIterable<string>;
  finishReason: PromiseLike<string>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * ストリームを開始し、最初のチャンクを強制的に取得することで、接続時のエラー(429/503等)を
 * ここでキャッチして再試行できるようにする。
 */
export async function startTextStream<R extends TextStreamLike>(
  start: (onError: (error: unknown) => void) => R,
  signal?: AbortSignal
): Promise<{ result: R; textStream: AsyncIterable<string> }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let streamError: unknown;
    try {
      const result = start((error) => {
        streamError = error;
      });
      const iterator = result.textStream[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (first.done && streamError) throw streamError;

      const textStream = (async function* () {
        if (!first.done) yield first.value;
        for (;;) {
          const next = await iterator.next();
          if (next.done) break;
          yield next.value;
        }
        // streamTextはストリーム途中のエラーを握りつぶして終了することがあるため、ここで改めて投げる
        if (streamError) throw streamError;
      })();
      return { result, textStream };
    } catch (error) {
      const retryable =
        APICallError.isInstance(error) && (isQuotaExhausted(error) || isTransientOverload(error));
      if (!retryable || attempt === MAX_RETRIES || signal?.aborted) throw error;

      const suggestedMs = isQuotaExhausted(error as APICallError)
        ? getSuggestedRetryDelayMs(error as APICallError)
        : undefined;
      const waitMs =
        suggestedMs !== undefined ? Math.min(suggestedMs, MAX_QUOTA_WAIT_MS) : BASE_RETRY_DELAY_MS * 2 ** attempt;
      console.warn(
        `[ai] ${isQuotaExhausted(error as APICallError) ? "クォータ超過" : "サーバー混雑"}を検知。${
          Math.round(waitMs / 100) / 10
        }秒待機後に同一モデルで再試行します(${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(waitMs, signal);
    }
  }
  throw new Error("AIリクエストが失敗しました");
}

// 継続生成(出力上限による打ち切りからの自動リカバリ)の設定。
// 実行時間にはソフトな上限を設け、後処理(DB保存等)の時間が残るうちだけ継続する。
export const SOFT_DEADLINE_MS = 280_000;
const MAX_CONTINUATIONS = 2;
const CONTINUATION_SAFETY_MARGIN_MS = 12_000;
const CONTINUATION_TAIL_CHARS = 1500;

export interface GenerationParams {
  modelId: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  buildContinuationPrompt: (tailText: string) => string;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  /** この値を超える出力済み文字数では、継続生成を行わず確定する(膨張しやすいモデル用)。 */
  hardCharCeiling?: number | null;
  startedAt?: number;
}

export interface GenerationResult {
  text: string;
  /** 上限に達し、自動継続でも完結しなかった */
  truncated: boolean;
}

/** 本文のストリーミング生成。上限で切れた場合は、続きだけを自動で追加生成して連結する。 */
export async function generateWithContinuation(params: GenerationParams): Promise<GenerationResult> {
  const { modelId, system, prompt, maxOutputTokens, onDelta, signal } = params;
  const startedAt = params.startedAt ?? Date.now();
  const { provider, model } = resolveLanguageModel(modelId);
  const providerOptions = providerOptionsFor(modelId);

  let fullText = "";
  let finishReason = "stop";

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const isContinuation = attempt > 0;
    try {
      const { result, textStream } = await startTextStream(
        (onError) =>
          streamText({
            model,
            system,
            prompt: isContinuation ? params.buildContinuationPrompt(fullText.slice(-CONTINUATION_TAIL_CHARS)) : prompt,
            maxOutputTokens,
            providerOptions,
            abortSignal: signal,
            onError: ({ error }) => onError(error),
          }),
        signal
      );

      for await (const delta of textStream) {
        fullText += delta;
        onDelta(delta);
      }
      finishReason = await result.finishReason;
      console.log(`[ai] attempt=${attempt} provider=${provider} model=${modelId} finishReason=${finishReason}`);
    } catch (error) {
      if (!isContinuation || signal?.aborted) throw error;
      // 継続生成自体が失敗しても、ここまでの本文は無駄にせず確定させる(打ち切り扱い)
      console.error("[ai] 続きの自動生成に失敗。ここまでの内容で確定します:", error);
      finishReason = "length";
      break;
    }

    if (finishReason !== "length") break;

    if (params.hardCharCeiling != null && fullText.length >= params.hardCharCeiling) {
      console.warn(`[ai] 出力文字数(${fullText.length})が安全上限(${params.hardCharCeiling})に達したため継続せず確定します`);
      break;
    }
    const remainingMs = SOFT_DEADLINE_MS - (Date.now() - startedAt);
    if (attempt >= MAX_CONTINUATIONS || remainingMs < CONTINUATION_SAFETY_MARGIN_MS) break;
    console.warn(`[ai] maxOutputTokens(${maxOutputTokens})に到達。続きを自動生成します(${attempt + 1}/${MAX_CONTINUATIONS})`);
  }

  return { text: fullText, truncated: finishReason === "length" };
}

/** 短い構造化出力・補助的な生成用(SEOメタ、アイキャッチのプロンプト等)。失敗時は例外を投げる。 */
export async function generateShortText(modelId: string, system: string, prompt: string): Promise<string> {
  const { model } = resolveLanguageModel(modelId);
  const result = await generateText({ model, system, prompt, providerOptions: providerOptionsFor(modelId) });
  return result.text;
}
