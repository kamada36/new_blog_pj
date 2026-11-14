"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateSnsBatchAction } from "./actions";

const BUTTON =
  "rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-50";

/**
 * 紹介文のまだ無い公開記事に、AIで3パターンの投稿文を作る。数件ずつのリクエストを、残りが無くなるまで繰り返す
 * (Netlifyの関数は60秒で打ち切られるため、1回で全記事は処理しない)。
 */
export function GeneratePanel({ publishedArticles, articlesWithPosts }: { publishedArticles: number; articlesWithPosts: number }) {
  const router = useRouter();
  const [done, setDone] = useState(articlesWithPosts);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState<{ articleId: string; title: string; error: string }[]>([]);
  const stopRef = useRef(false);

  const missing = Math.max(0, publishedArticles - done);

  async function run() {
    if (running) return;
    setRunning(true);
    setError("");
    setFailures([]);
    stopRef.current = false;

    const excludeIds: string[] = [];
    const allFailures: typeof failures = [];
    try {
      for (;;) {
        const result = await generateSnsBatchAction({ excludeIds });
        if (!result.ok) {
          setError(result.error);
          break;
        }
        setDone((n) => n + result.generated);
        allFailures.push(...result.failed);
        excludeIds.push(...result.failed.map((f) => f.articleId));
        setFailures([...allFailures]);
        // 残りが無い・進捗が無い(これ以上作れる記事が無い)・停止が押されたら終了
        if (result.remaining === 0 || (result.generated === 0 && result.failed.length === 0) || stopRef.current) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿文の作成に失敗しました。");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">1. 投稿文を作る</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            公開中{publishedArticles}件のうち、<strong className="text-foreground">{done}件</strong>は作成済み
            {missing > 0 && `(未作成 ${missing}件)`}。1記事につき、切り口の違う3パターン(気づき・主張型 / 問いかけ・共感型 / 要点型)を作ります。作った文は「承認待ち」になり、確認して承認するまで出力されません。AIの利用料がかかります。
          </p>
        </div>
        <div className="flex gap-2">
          {running && (
            <button type="button" onClick={() => (stopRef.current = true)} className={BUTTON}>
              停止
            </button>
          )}
          <button type="button" onClick={run} disabled={running || missing === 0} className={PRIMARY_BUTTON}>
            {running ? `作成中… (${done}/${publishedArticles})` : missing === 0 ? "すべて作成済みです" : `未作成の${missing}件を作成`}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      {failures.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-red-600">
          {failures.map((f) => (
            <li key={f.articleId}>
              ⚠ 「{f.title}」: {f.error}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
