import "server-only";
import { describeAiError } from "./provider";
import { encodeEvent } from "./stream";

/** 認証済みの管理者がいなければ401のJSONを返す(proxy.tsの/admin保護に加えた、Route Handler側の検証)。 */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "セッションが切れました。ログインし直してください。" }, { status: 401 });
}

export function badRequestResponse(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * NDJSONでイベントを流すストリーミングレスポンスを作る。
 * 先頭に空行を即座に送り、AI APIの応答を待つ間にプラットフォーム側がTTFBタイムアウトで接続を切るのを防ぐ。
 * runの中で投げられた例外は、errorイベントとして画面に届ける。
 */
export function ndjsonResponse<E extends { type: string }>(
  run: (send: (event: E) => void) => Promise<void>,
  modelId?: string
): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: E) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          closed = true; // クライアントが切断済み
        }
      };

      controller.enqueue(encoder.encode("\n"));
      try {
        await run(send);
      } catch (error) {
        console.error("[ai] ストリーミング処理でエラーが発生しました:", error);
        send({ type: "error", message: describeAiError(error, modelId) } as unknown as E);
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // 既に閉じられている
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
