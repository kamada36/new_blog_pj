"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LinkIndexStatus } from "@/lib/ai/linkTypes";
import { indexLinksAction } from "./actions";

const BUTTON =
  "rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-50";

/**
 * 内部リンク候補のための「記事索引」(各公開記事のAI要約)の作成・更新。
 * 索引の無い記事を15件ずつ要約するリクエストを、完了するまで繰り返す。
 */
export function LinkIndexPanel({
  initialStatus,
  onError,
  disabled,
}: {
  initialStatus: LinkIndexStatus;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [running, setRunning] = useState(false);
  const [failures, setFailures] = useState<{ articleId: string; title: string; error: string }[]>([]);
  const stopRef = useRef(false);

  const missing = Math.max(0, status.published - status.indexed);

  async function run(reset: boolean) {
    if (running) return;
    if (reset && !window.confirm("索引と、保存済みの内部リンク候補をすべて消して、要約を作り直します。AIの利用料がかかります。よろしいですか？")) {
      return;
    }
    setRunning(true);
    setFailures([]);
    stopRef.current = false;

    const excludeIds: string[] = [];
    const allFailures: typeof failures = [];
    let resetPending = reset;
    try {
      for (;;) {
        const result = await indexLinksAction({ excludeIds, reset: resetPending });
        resetPending = false;
        if (!result.ok) {
          onError(result.error);
          break;
        }
        setStatus(result.status);
        allFailures.push(...result.failed);
        excludeIds.push(...result.failed.map((f) => f.articleId));
        setFailures([...allFailures]);
        // 進捗がない(これ以上要約できる記事が無い)か、停止が押されたら終了
        if (result.remaining === 0 || (result.summarized === 0 && result.failed.length === 0) || stopRef.current) break;
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "索引の作成に失敗しました。");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">内部リンク候補の索引</p>
          <p className="mt-1 text-xs text-foreground-muted">
            公開中{status.published}件のうち、<strong className="text-foreground">{status.indexed}件</strong>の要約を作成済み
            {missing > 0 && `(未作成 ${missing}件)`}。記事の要約をもとに、AIが自然に紹介できる関連記事を選びます。要約は一度作れば、リライトしても作り直す必要はありません。
          </p>
        </div>
        <div className="flex gap-2">
          {running && (
            <button type="button" onClick={() => (stopRef.current = true)} className={BUTTON}>
              停止
            </button>
          )}
          <button type="button" onClick={() => run(false)} disabled={running || disabled || missing === 0} className={PRIMARY_BUTTON}>
            {running ? `作成中… (${status.indexed}/${status.published})` : missing === 0 ? "索引は最新です" : `未作成の${missing}件の索引を作成`}
          </button>
          {status.indexed > 0 && (
            <button type="button" onClick={() => run(true)} disabled={running || disabled} className={BUTTON}>
              すべて作り直す
            </button>
          )}
        </div>
      </div>
      {failures.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-red-600">
          {failures.map((f) => (
            <li key={f.articleId}>
              ⚠ 「{f.title}」: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
