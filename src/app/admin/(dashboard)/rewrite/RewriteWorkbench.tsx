"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModelSelect } from "@/components/admin/ai/ModelSelect";
import { estimateRewriteCost, formatJpy } from "@/lib/ai/costs";
import { DEFAULT_REWRITE_MODEL, getModel, getProviderForModel } from "@/lib/ai/models";
import { MAX_INTERNAL_LINKS_PER_REWRITE } from "@/lib/ai/limits";
import { postEventStream, type RewriteStreamEvent } from "@/lib/ai/stream";
import {
  finalizeRewriteAction,
  revertRewriteAction,
  searchLinkCandidatesAction,
  type LinkCandidate,
} from "./actions";

export type RewriteRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
  publishedAt: string | null;
  contentLength: number;
  categoryName: string;
  /** 未確定のリライトがある(元に戻せる) */
  pending: boolean;
};

type PublishChoice = "keep" | "draft" | "published";
type Toast = { id: number; type: "success" | "error" | "warning"; text: string };

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  published: { label: "公開中", className: "bg-accent-soft text-accent-dark" },
  private: { label: "非公開", className: "bg-red-50 text-red-600" },
  draft: { label: "下書き", className: "bg-surface-muted text-foreground-muted" },
};

const MODEL_STORAGE_KEY = "admin.rewrite.model";
const LIVE_PREVIEW_TAIL_CHARS = 800;

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-dark disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RewriteWorkbench({
  rows,
  keys,
}: {
  rows: RewriteRow[];
  keys: { gemini: boolean; anthropic: boolean };
}) {
  const router = useRouter();
  const [modelId, setModelId] = useState(DEFAULT_REWRITE_MODEL);
  const [publishStatus, setPublishStatus] = useState<PublishChoice>("keep");
  const [insertUpdatedNote, setInsertUpdatedNote] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, LinkCandidate[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [liveBody, setLiveBody] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const modelRestoredRef = useRef(false);
  const toastSeqRef = useRef(0);

  // 選んだモデルはブラウザに覚えておく
  useEffect(() => {
    if (modelRestoredRef.current) return;
    modelRestoredRef.current = true;
    try {
      const stored = localStorage.getItem(MODEL_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント時に一度だけ、ブラウザ保存の値で初期化する
      if (stored && getModel(stored)) setModelId(stored);
    } catch {
      // 保存値が読めなければ既定のモデルのまま
    }
  }, []);

  function changeModel(next: string) {
    setModelId(next);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch {
      // 保存できなくても動作には影響しない
    }
  }

  function pushToast(type: Toast["type"], text: string) {
    const id = ++toastSeqRef.current;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000);
  }

  const keyMissing =
    getProviderForModel(modelId) === "claude"
      ? !keys.anthropic && "ANTHROPIC_API_KEY"
      : !keys.gemini && "GEMINI_API_KEY";

  async function handleRewrite(row: RewriteRow) {
    if (busyId) return;
    if (
      row.status === "published" &&
      publishStatus === "keep" &&
      !window.confirm(
        `「${row.title}」は公開中です。リライトすると、公開ページの本文がすぐに書き換わります(確定するまでは元に戻せます)。実行しますか？`
      )
    ) {
      return;
    }

    setBusyId(row.id);
    setLiveBody("");
    const controller = new AbortController();
    abortRef.current = controller;
    let live = "";

    try {
      await postEventStream<RewriteStreamEvent>(
        "/admin/api/rewrite",
        {
          articleId: row.id,
          modelId,
          instruction: instructions[row.id]?.trim() || undefined,
          internalLinkArticleIds: (links[row.id] ?? []).map((l) => l.id),
          publishStatus,
          insertUpdatedNote,
        },
        (event) => {
          if (event.type === "delta") {
            live += event.text;
            // 本文の後ろに続く変更概要(===SUMMARY===以降)はプレビューに出さない
            setLiveBody(live.split(/\n?===\s*SUMMARY\s*===/i)[0]);
          } else if (event.type === "result") {
            pushToast("success", event.result.summary ? `リライトして保存しました。${event.result.summary}` : "リライトして保存しました。");
            if (event.result.missingLinkUrls.length > 0) {
              pushToast("warning", `内部リンク${event.result.missingLinkUrls.length}件が本文に挿入されませんでした。もう一度リライトすると再試行できます。`);
            } else {
              setLinks((prev) => ({ ...prev, [row.id]: [] }));
            }
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        },
        controller.signal
      );
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      pushToast(
        aborted ? "warning" : "error",
        aborted
          ? "リライトを中断しました。"
          : error instanceof Error
            ? error.message
            : "リライトに失敗しました。"
      );
    } finally {
      setBusyId(null);
      setLiveBody("");
      router.refresh();
    }
  }

  async function handleRevert(row: RewriteRow) {
    if (busyId) return;
    if (!window.confirm(`「${row.title}」をリライト前の状態に戻します。よろしいですか？`)) return;
    setBusyId(row.id);
    const result = await revertRewriteAction(row.id);
    setBusyId(null);
    if (result.ok) pushToast("success", "リライト前の記事に戻しました。");
    else pushToast("error", result.error);
    router.refresh();
  }

  async function handleFinalize(row: RewriteRow) {
    if (busyId) return;
    if (!window.confirm(`「${row.title}」のリライトを確定します。確定後はリライト前に戻せません。よろしいですか？`)) return;
    setBusyId(row.id);
    const result = await finalizeRewriteAction(row.id);
    setBusyId(null);
    if (result.ok) pushToast("success", "リライト内容を確定しました。");
    else pushToast("error", result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 全体設定 */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-bold">リライト設定(全記事共通)</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <ModelSelect label="使用するAIモデル" value={modelId} onChange={changeModel} disabled={busyId !== null} />
          <div>
            <label className="text-xs font-semibold text-foreground-muted">保存後の公開状態</label>
            <select
              value={publishStatus}
              onChange={(e) => setPublishStatus(e.target.value as PublishChoice)}
              disabled={busyId !== null}
              className={`${INPUT_CLASS} mt-1`}
            >
              <option value="keep">現在の状態のまま</option>
              <option value="draft">下書きにする</option>
              <option value="published">公開する</option>
            </select>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={insertUpdatedNote}
            onChange={(e) => setInsertUpdatedNote(e.target.checked)}
            disabled={busyId !== null}
          />
          本文の先頭に「最終更新日」を入れる
        </label>
        {keyMissing && <p className="mt-3 text-sm font-semibold text-red-600">⚠ {keyMissing} が未設定のため、このモデルは使えません。</p>}
      </section>

      {toasts.length > 0 && (
        <div className="flex flex-col gap-2" role="status">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl border p-3 text-sm font-medium ${
                toast.type === "success"
                  ? "border-green-300 bg-green-50 text-green-800"
                  : toast.type === "warning"
                    ? "border-accent bg-accent-soft"
                    : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              {toast.text}
            </div>
          ))}
        </div>
      )}

      {/* 記事一覧 */}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-foreground-muted">
          該当する記事がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const isBusy = busyId === row.id;
            const instruction = instructions[row.id] ?? "";
            const selectedLinks = links[row.id] ?? [];
            const estimate = estimateRewriteCost(modelId, row.title.length + row.contentLength, instruction.length + selectedLinks.length * 150);
            const badge = STATUS_BADGES[row.status] ?? STATUS_BADGES.draft;

            return (
              <li key={row.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/admin/articles/${row.id}`} className="font-semibold hover:text-accent-dark hover:underline">
                      {row.title || "(無題)"}
                    </Link>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {row.categoryName} ・ {row.contentLength.toLocaleString()}文字 ・ 更新 {formatDateTime(row.updatedAt)}
                      {row.status === "published" && (
                        <>
                          {" ・ "}
                          <Link href={`/articles/${row.slug}`} target="_blank" className="hover:underline">
                            公開ページ ↗
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                </div>

                {row.pending && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent bg-accent-soft p-3">
                    <p className="text-xs font-semibold text-accent-dark">
                      未確定のリライトがあります。確定するまで、元の記事に戻せます。
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleRevert(row)} disabled={busyId !== null} className={SECONDARY_BUTTON}>
                        元に戻す
                      </button>
                      <button type="button" onClick={() => handleFinalize(row)} disabled={busyId !== null} className={PRIMARY_BUTTON}>
                        この内容で確定
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  value={instruction}
                  onChange={(e) => setInstructions((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  placeholder="この記事だけの指示(任意) 例: もっとカジュアルな口調にする / 結論を冒頭に持ってくる"
                  rows={2}
                  disabled={busyId !== null}
                  className={`${INPUT_CLASS} mt-3`}
                />

                <LinkPicker
                  articleId={row.id}
                  selected={selectedLinks}
                  onChange={(next) => setLinks((prev) => ({ ...prev, [row.id]: next }))}
                  disabled={busyId !== null}
                />

                {isBusy && (
                  <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground-muted">
                    {liveBody
                      ? liveBody.length > LIVE_PREVIEW_TAIL_CHARS
                        ? `…${liveBody.slice(-LIVE_PREVIEW_TAIL_CHARS)}`
                        : liveBody
                      : "生成を開始しています…"}
                  </pre>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-foreground-muted">
                    推定コスト: {formatJpy(estimate.totalCostJpy)}(入出力合計 約{estimate.totalTokens.toLocaleString()}トークン)
                  </p>
                  <div className="flex gap-2">
                    {isBusy && (
                      <button type="button" onClick={() => abortRef.current?.abort()} className={SECONDARY_BUTTON}>
                        停止
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRewrite(row)}
                      disabled={busyId !== null || Boolean(keyMissing)}
                      className={PRIMARY_BUTTON}
                    >
                      {isBusy ? "リライト中…" : "リライトして保存"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 内部リンク(あわせて読みたい)として本文へ挿入する自サイト記事を選ぶ。 */
function LinkPicker({
  articleId,
  selected,
  onChange,
  disabled,
}: {
  articleId: string;
  selected: LinkCandidate[];
  onChange: (next: LinkCandidate[]) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    const result = await searchLinkCandidatesAction(query, articleId);
    setSearching(false);
    setSearched(true);
    setResults(result.ok ? result.items : []);
  }

  const atLimit = selected.length >= MAX_INTERNAL_LINKS_PER_REWRITE;

  return (
    <details className="mt-3 rounded-xl border border-border px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold">
        内部リンクを入れる(任意){selected.length > 0 && ` — ${selected.length}件選択中`}
      </summary>
      <div className="mt-2">
        {selected.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selected.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium">
                {item.title}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((s) => s.id !== item.id))}
                  disabled={disabled}
                  aria-label={`「${item.title}」を外す`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="公開中の記事をタイトルで検索"
            disabled={disabled}
            className={INPUT_CLASS}
          />
          <button type="button" onClick={search} disabled={disabled || searching || !query.trim()} className={`${SECONDARY_BUTTON} shrink-0`}>
            {searching ? "検索中…" : "検索"}
          </button>
        </div>
        {searched && results.length === 0 && <p className="mt-2 text-xs text-foreground-muted">該当する公開記事がありません。</p>}
        {results.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {results.map((item) => {
              const checked = selected.some((s) => s.id === item.id);
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-xs hover:bg-surface-muted">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || (!checked && atLimit)}
                      onChange={() => onChange(checked ? selected.filter((s) => s.id !== item.id) : [...selected, item])}
                      className="mt-0.5"
                    />
                    <span>{item.title}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {atLimit && <p className="mt-2 text-xs text-foreground-muted">1回のリライトで入れられる内部リンクは{MAX_INTERNAL_LINKS_PER_REWRITE}件までです。</p>}
      </div>
    </details>
  );
}
