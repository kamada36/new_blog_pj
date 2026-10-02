// Route Handlerとクライアントの間で使うストリーミング形式。
// 1行1イベントのJSON(NDJSON)で送る。元ツールは本文の末尾に目印文字列を連結する方式だったが、
// 本文・SEO情報・画像・保存結果を型付きのイベントとして分けた方が壊れにくいため置き換えた。
// サーバー・クライアントの両方から使うため、Node固有APIには依存しない。

export type OutlineStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface SeoMeta {
  title: string;
  metaDescription: string;
  tags: string[];
}

export interface SavedArticleInfo {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
}

export type ArticleStreamEvent =
  | { type: "delta"; text: string }
  /** 上限に達し、自動継続でも完結しなかった(本文は途中で終わっている可能性がある) */
  | { type: "truncated" }
  /** 本文の執筆が終わり、SEO情報・画像生成・保存を行っている */
  | { type: "phase"; phase: "finalizing" }
  | { type: "seo"; seo: SeoMeta }
  | { type: "eyecatch"; prompt: string; imageUrl: string | null; error?: string }
  | { type: "saved"; article: SavedArticleInfo; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface RewriteResultInfo {
  summary: string | null;
  /** 追加を依頼した内部リンクのうち、本文に入らなかったもののURL */
  missingLinkUrls: string[];
  status: string;
}

export type RewriteStreamEvent =
  | { type: "delta"; text: string }
  | { type: "result"; result: RewriteResultInfo }
  | { type: "done" }
  | { type: "error"; message: string };

const encoder = new TextEncoder();

/** サーバー側: イベントを1行のJSONとしてエンコードする。 */
export function encodeEvent(event: object): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

/**
 * クライアント側: POSTしてNDJSONを読み、イベントごとにコールバックを呼ぶ。
 * 認証切れ(proxyによるログインページへのリダイレクト)や、プラットフォームのタイムアウトで
 * JSON以外が返った場合も、握りつぶさずに分かるメッセージのErrorとして投げる。
 */
export async function postEventStream<E extends { type: string }>(
  url: string,
  body: unknown,
  onEvent: (event: E) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (res.redirected || res.status === 401) {
    throw new Error("セッションが切れました。ログインし直してください。");
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let message = text.slice(0, 200);
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // JSONではない場合は生テキストをそのまま使う
    }
    throw new Error(message || `リクエストに失敗しました(${res.status})。`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLines = (final: boolean) => {
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) emitLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
    if (final && buffer.trim()) {
      emitLine(buffer.trim());
      buffer = "";
    }
  };

  const emitLine = (line: string) => {
    let event: E;
    try {
      event = JSON.parse(line) as E;
    } catch {
      return; // 壊れた行(途中切断など)は読み飛ばす
    }
    onEvent(event);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flushLines(false);
  }
  buffer += decoder.decode();
  flushLines(true);
}
