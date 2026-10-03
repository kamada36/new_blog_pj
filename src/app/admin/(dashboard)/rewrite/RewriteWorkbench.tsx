"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { contentPath } from "@/lib/slug";
import { useRouter } from "next/navigation";
import { ModelSelect } from "@/components/admin/ai/ModelSelect";
import { estimateRewriteCost, formatJpy } from "@/lib/ai/costs";
import { DEFAULT_REWRITE_MODEL, getModel, getProviderForModel } from "@/lib/ai/models";
import { isInternalLinkFormat, type InternalLinkFormat, type LinkIndexStatus, type LinkSuggestionView } from "@/lib/ai/linkTypes";
import { postEventStream, type RewriteStreamEvent } from "@/lib/ai/stream";
import {
  finalizeRewriteAction,
  findLinkSuggestionsAction,
  revertRewriteAction,
  type LinkCandidate,
} from "./actions";
import { LinkIndexPanel } from "./LinkIndexPanel";
import { LinkSuggestionsPanel } from "./LinkSuggestionsPanel";

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
  /** AIが選別した内部リンク候補。null = まだ候補を探していない */
  suggestions: LinkSuggestionView[] | null;
};

type PublishChoice = "keep" | "draft" | "published";
type Toast = { id: number; type: "success" | "error" | "warning"; text: string };

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  published: { label: "公開中", className: "bg-accent-soft text-accent-dark" },
  private: { label: "非公開", className: "bg-red-50 text-red-600" },
  draft: { label: "下書き", className: "bg-surface-muted text-foreground-muted" },
};

const MODEL_STORAGE_KEY = "admin.rewrite.model";
const LINK_FORMAT_STORAGE_KEY = "admin.rewrite.linkFormat";
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
  linkStatus,
}: {
  rows: RewriteRow[];
  keys: { gemini: boolean; anthropic: boolean };
  /** 内部リンク候補の索引の状況。null = 必要なテーブルが無い(マイグレーション未適用) */
  linkStatus: LinkIndexStatus | null;
}) {
  const router = useRouter();
  const [modelId, setModelId] = useState(DEFAULT_REWRITE_MODEL);
  const [publishStatus, setPublishStatus] = useState<PublishChoice>("keep");
  const [insertUpdatedNote, setInsertUpdatedNote] = useState(true);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, LinkCandidate[]>>({});
  const [linkFormat, setLinkFormat] = useState<InternalLinkFormat>("callout");
  // 画面で探し直した候補(サーバーから再取得されるまでの表示用)
  const [foundSuggestions, setFoundSuggestions] = useState<Record<string, LinkSuggestionView[]>>({});
  const [findingIds, setFindingIds] = useState<Set<string>>(new Set());
  const indexedCount = linkStatus?.indexed ?? 0;
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
      const storedFormat = localStorage.getItem(LINK_FORMAT_STORAGE_KEY);
      if (isInternalLinkFormat(storedFormat)) setLinkFormat(storedFormat);
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

  function changeLinkFormat(next: InternalLinkFormat) {
    setLinkFormat(next);
    try {
      localStorage.setItem(LINK_FORMAT_STORAGE_KEY, next);
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
          internalLinkFormat: linkFormat,
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
      // リライトで本文が変わるため、「リンク済み」の判定を含む候補はサーバーから取り直す
      setFoundSuggestions((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      router.refresh();
    }
  }

  async function handleFind(articleIds: string[], force: boolean) {
    if (articleIds.length === 0 || findingIds.size > 0) return;
    setFindingIds(new Set(articleIds));
    const result = await findLinkSuggestionsAction(articleIds, force);
    setFindingIds(new Set());
    if (!result.ok) return pushToast("error", result.error);
    setFoundSuggestions((prev) => ({ ...prev, ...result.results }));
    // 探し直した結果に含まれない(もう候補でない)記事のチェックは外す
    setLinks((prev) => {
      const next = { ...prev };
      for (const id of articleIds) {
        const keep = new Set((result.results[id] ?? []).map((s) => s.articleId));
        next[id] = (next[id] ?? []).filter((c) => keep.has(c.id));
      }
      return next;
    });
    for (const f of result.failed) pushToast("error", `候補を探せませんでした: ${f.error}`);
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
        {linkStatus ? (
          <LinkIndexPanel initialStatus={linkStatus} onError={(m) => pushToast("error", m)} disabled={busyId !== null || !keys.gemini} />
        ) : (
          <p className="mt-4 rounded-xl border border-accent bg-accent-soft p-3 text-xs">
            ⚠ 内部リンク候補の機能に必要なテーブルがまだありません。ターミナルで <code>npx prisma migrate deploy</code> を実行してください(手動で記事を探してリンクを入れる機能は、そのまま使えます)。
          </p>
        )}
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
      {linkStatus && indexedCount > 0 && rows.some((r) => r.suggestions === null && !foundSuggestions[r.id]) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-xs">
          <span className="text-foreground-muted">候補を探していない記事があります。このページの記事の内部リンク候補を、まとめて探せます(AIを使います)。</span>
          <button
            type="button"
            onClick={() => handleFind(rows.filter((r) => r.suggestions === null && !foundSuggestions[r.id]).map((r) => r.id), false)}
            disabled={busyId !== null || findingIds.size > 0 || Boolean(!keys.gemini)}
            className={SECONDARY_BUTTON}
          >
            {findingIds.size > 0 ? "候補を探しています…" : "このページの候補をまとめて探す"}
          </button>
        </div>
      )}
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
                          <Link href={contentPath(row.slug)} target="_blank" className="hover:underline">
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

                <LinkSuggestionsPanel
                  articleId={row.id}
                  suggestions={foundSuggestions[row.id] ?? row.suggestions}
                  indexedCount={indexedCount}
                  selected={selectedLinks}
                  onSelectedChange={(next) => setLinks((prev) => ({ ...prev, [row.id]: next }))}
                  format={linkFormat}
                  onFormatChange={changeLinkFormat}
                  finding={findingIds.has(row.id)}
                  onFind={(force) => handleFind([row.id], force)}
                  disabled={busyId !== null || (linkStatus !== null && !keys.gemini && indexedCount === 0)}
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
