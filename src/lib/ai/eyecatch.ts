import "server-only";
import { saveUploadedFile } from "@/lib/storage";
import { EYECATCH_PROMPT_SUFFIX, buildEyecatchPromptRequest } from "./articlePrompts";
import { generateShortText, requireGeminiKey } from "./provider";

// Geminiの画像生成(Nano Banana系)によるアイキャッチ画像の生成。
// reference-tools/blog2 の gemini-image.ts を移植したもの。保存先はWordPressのメディアではなく、
// このブログのR2(メディアライブラリ)。
//
// 旧Imagenモデル(predict系)は新規ユーザー不可のため、generateContentで画像を返せるGemini系モデルを使う。
// アスペクト比は generationConfig.imageConfig.aspectRatio で指定する(responseFormat系の項目は実在しない)。

const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const EYECATCH_ASPECT_RATIO = "16:9";

interface GeneratedImage {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

async function generateEyecatchImage(prompt: string): Promise<GeneratedImage> {
  const apiKey = requireGeminiKey();
  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: EYECATCH_ASPECT_RATIO },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<failed to read error body>");
    throw new Error(`画像生成に失敗しました: ${response.status} ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const parts: { inlineData?: { data?: string; mimeType?: string } }[] | undefined =
    data?.candidates?.[0]?.content?.parts;
  const imagePart = Array.isArray(parts) ? parts.find((part) => part?.inlineData?.data) : undefined;
  if (!imagePart?.inlineData?.data) {
    throw new Error("画像生成のレスポンスに画像データが含まれていません(安全フィルタ等でブロックされた可能性があります)");
  }

  return {
    bytes: new Uint8Array(Buffer.from(imagePart.inlineData.data, "base64")),
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

/** 記事テーマから、画像生成AIへ渡す英語の指示文を作る。失敗時はnull(画像生成をスキップするだけ)。 */
export async function generateEyecatchPrompt(
  source: string,
  outlineJson: string | undefined,
  modelId: string
): Promise<string | null> {
  const { system, prompt } = buildEyecatchPromptRequest(source, outlineJson);
  try {
    const text = await generateShortText(modelId, system, prompt);
    const scenePrompt = text.trim().replace(/^["'`]+|["'`]+$/g, "");
    return scenePrompt ? `${scenePrompt} ${EYECATCH_PROMPT_SUFFIX}` : null;
  } catch (error) {
    console.error("[eyecatch] アイキャッチ画像のプロンプト作成に失敗しました:", error);
    return null;
  }
}

/** プロンプトから画像を生成し、R2(メディアライブラリ)へ保存して公開URLを返す。 */
export async function generateAndStoreEyecatch(prompt: string): Promise<string> {
  const image = await generateEyecatchImage(prompt);
  const ext = image.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const file = new File([image.bytes], `eyecatch-${Date.now()}.${ext}`, { type: image.mimeType });
  return saveUploadedFile(file, "articles", "article");
}
