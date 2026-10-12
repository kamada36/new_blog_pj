// AIジョブ(バックグラウンド実行)と画面の間で使うイベントの形式。
// 元ツールは本文の末尾に目印文字列を連結する方式だったが、本文・SEO情報・画像・保存結果を
// 型付きのイベントとして分けた方が壊れにくいため置き換えた。
// サーバー・クライアントの両方から使うため、Node固有APIには依存しない。

import type { AiJobKind } from "./jobKinds";

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

const POLL_INTERVAL_MS = 1000;
// 通信の失敗(圏外・一時的なサーバーエラーなど)が、この回数続いたら諦める。バックグラウンドの処理は
// 画面とは無関係に続くため、1〜2回の失敗では中断せず、読み取りを再試行する。
const MAX_CONSECUTIVE_POLL_FAILURES = 8;

const SESSION_EXPIRED_MESSAGE = "セッションが切れました。ログインし直してください。";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 認証切れ(proxyによるログインページへのリダイレクト、または401)かどうか。 */
function isSessionExpired(res: Response): boolean {
  if (res.status === 401) return true;
  return res.redirected && new URL(res.url).pathname.startsWith("/admin/login");
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 200);
  try {
    const data = JSON.parse(text) as { error?: string };
    if (data.error) message = data.error;
  } catch {
    // JSONではない場合は生テキストをそのまま使う
  }
  return message || `リクエストに失敗しました(${res.status})。`;
}

/**
 * クライアント側: AI処理(ジョブ)を開始し、進捗のイベントを1秒ごとに読み取って、イベントごとにコールバックを呼ぶ。
 * Netlifyの関数は60秒で打ち切られるため、長い処理はバックグラウンド関数で実行し、画面は結果を読み取るだけにしている。
 * 'done' か 'error' のイベントを受け取ると終わる。signal が中断されたら、ジョブの取り消しを依頼して AbortError を投げる。
 */
export async function streamAiJob<E extends { type: string }>(
  kind: AiJobKind,
  input: unknown,
  onEvent: (event: E) => void,
  signal?: AbortSignal
): Promise<void> {
  const startRes = await fetch("/admin/api/ai-jobs/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, input }),
    signal,
  });
  if (isSessionExpired(startRes)) throw new Error(SESSION_EXPIRED_MESSAGE);
  if (!startRes.ok) throw new Error(await readErrorMessage(startRes));
  const { jobId } = (await startRes.json()) as { jobId: string };
  const jobUrl = `/admin/api/ai-jobs/${encodeURIComponent(jobId)}/`;

  // 画面側で中断(または「止める」ボタン)されたら、バックグラウンドの処理も止めてもらう
  signal?.addEventListener(
    "abort",
    () => {
      void fetch(jobUrl, { method: "DELETE", keepalive: true }).catch(() => {});
    },
    { once: true }
  );

  let cursor = 0;
  let failures = 0;
  for (;;) {
    await sleep(POLL_INTERVAL_MS, signal);

    let res: Response;
    try {
      res = await fetch(`${jobUrl}?after=${cursor}`, { cache: "no-store", signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (++failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error("進捗を読み取れませんでした。通信状況を確認してください(処理はバックグラウンドで続いている場合があります)。");
      }
      continue;
    }

    if (isSessionExpired(res)) throw new Error(SESSION_EXPIRED_MESSAGE);
    if (res.status === 404) throw new Error("ジョブが見つかりませんでした。");
    if (!res.ok) {
      if (++failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw new Error(await readErrorMessage(res));
      continue;
    }
    failures = 0;

    const data = (await res.json()) as { status: string; events: { id: number; payload: E }[] };
    let finished = false;
    for (const event of data.events) {
      cursor = event.id;
      onEvent(event.payload);
      if (event.payload.type === "done" || event.payload.type === "error") finished = true;
    }
    if (finished) return;
    // 終わっているのに終了イベントが無い(想定外)場合は、読み取りを続けずに終わる
    if (data.events.length === 0 && (data.status === "done" || data.status === "error" || data.status === "canceled")) return;
  }
}
