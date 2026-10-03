"use client";

import { useState } from "react";
import Link from "next/link";
import { contentPath } from "@/lib/slug";
import {
  INTERNAL_LINK_FORMATS,
  INTERNAL_LINK_FORMAT_LABELS,
  type InternalLinkFormat,
  type LinkSuggestionView,
} from "@/lib/ai/linkTypes";
import { MAX_INTERNAL_LINKS_PER_REWRITE } from "@/lib/ai/limits";
import { searchLinkCandidatesAction, type LinkCandidate } from "./actions";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const SMALL_BUTTON =
  "rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";

/**
 * 記事ごとの内部リンク候補。AIが選別した候補(最大3件)をチェックボックスで選ぶと、
 * 次のリライトのときに、AIがその記事へのリンクを本文の自然な位置へ挿入する。
 */
export function LinkSuggestionsPanel({
  articleId,
  suggestions,
  indexedCount,
  selected,
  onSelectedChange,
  format,
  onFormatChange,
  finding,
  onFind,
  disabled,
}: {
  articleId: string;
  /** null = まだ候補を探していない */
  suggestions: LinkSuggestionView[] | null;
  /** 索引ができている公開記事数。0なら候補を探す前に索引の作成が必要 */
  indexedCount: number;
  selected: LinkCandidate[];
  onSelectedChange: (next: LinkCandidate[]) => void;
  format: InternalLinkFormat;
  onFormatChange: (format: InternalLinkFormat) => void;
  finding: boolean;
  onFind: (force: boolean) => void;
  disabled: boolean;
}) {
  const atLimit = selected.length >= MAX_INTERNAL_LINKS_PER_REWRITE;
  const selectable = (suggestions ?? []).filter((s) => !s.linked);

  const toggle = (s: LinkSuggestionView) => {
    const exists = selected.some((c) => c.id === s.articleId);
    onSelectedChange(
      exists ? selected.filter((c) => c.id !== s.articleId) : [...selected, { id: s.articleId, title: s.title, slug: s.slug }]
    );
  };

  let body;
  if (indexedCount === 0 && suggestions === null) {
    body = (
      <p className="text-xs text-foreground-muted">
        記事の索引がまだ作られていません。上の「内部リンク候補の索引」で索引を作ると、関連する記事の候補がここに表示されます。
      </p>
    );
  } else if (suggestions === null) {
    body = (
      <button type="button" onClick={() => onFind(false)} disabled={finding || disabled} className={SMALL_BUTTON}>
        {finding ? "候補を探しています…" : "リンク候補を探す"}
      </button>
    );
  } else if (suggestions.length === 0) {
    body = <p className="text-xs text-foreground-muted">自然に紹介できる関連記事は見つかりませんでした。</p>;
  } else {
    body = (
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => {
          const checked = !s.linked && selected.some((c) => c.id === s.articleId);
          return (
            <li key={s.articleId} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                disabled={s.linked || disabled || (!checked && atLimit)}
                onChange={() => toggle(s)}
                aria-label={`「${s.title}」へのリンクをリライトに含める`}
                className="mt-1 shrink-0 accent-[var(--accent)]"
              />
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={contentPath(s.slug)} target="_blank" className="font-semibold hover:text-accent-dark hover:underline">
                    {s.title} ↗
                  </Link>
                  {s.linked && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">リンク済み</span>
                  )}
                </div>
                {s.reason && <p className="mt-0.5 text-foreground-muted">{s.reason}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-accent-dark">🔗 内部リンク候補</span>
        {suggestions !== null && (
          <button
            type="button"
            onClick={() => onFind(true)}
            disabled={finding || disabled}
            title="最新の記事索引で候補を探し直します"
            className="text-xs text-foreground-muted hover:text-foreground disabled:opacity-50"
          >
            {finding ? "検索中…" : "↻ 再検索"}
          </button>
        )}
      </div>

      {body}

      {(selectable.length > 0 || selected.length > 0) && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2 text-xs">
          <label className="flex flex-wrap items-center gap-2 text-foreground-muted">
            挿入形式
            <select
              value={format}
              onChange={(e) => onFormatChange(e.target.value as InternalLinkFormat)}
              disabled={disabled}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
            >
              {INTERNAL_LINK_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {INTERNAL_LINK_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-foreground-muted">
            {selected.length > 0
              ? `チェックした${selected.length}件のリンクを、リライト時にAIが自然な位置へ挿入します。`
              : "チェックした記事へのリンクを、リライト時にAIが自然な位置へ挿入します。"}
          </p>
        </div>
      )}

      <ManualLinkPicker articleId={articleId} selected={selected} onChange={onSelectedChange} disabled={disabled} atLimit={atLimit} />
    </div>
  );
}

/** 自動候補に無い記事を、タイトル検索で手動で追加する。 */
function ManualLinkPicker({
  articleId,
  selected,
  onChange,
  disabled,
  atLimit,
}: {
  articleId: string;
  selected: LinkCandidate[];
  onChange: (next: LinkCandidate[]) => void;
  disabled: boolean;
  atLimit: boolean;
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

  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-foreground-muted">自分で記事を探して追加する</summary>
      <div className="mt-2">
        {selected.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selected.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 font-medium">
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
          <button type="button" onClick={search} disabled={disabled || searching || !query.trim()} className={`${SMALL_BUTTON} shrink-0`}>
            {searching ? "検索中…" : "検索"}
          </button>
        </div>
        {searched && results.length === 0 && <p className="mt-2 text-foreground-muted">該当する公開記事がありません。</p>}
        {results.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {results.map((item) => {
              const checked = selected.some((s) => s.id === item.id);
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 hover:bg-surface">
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
        {atLimit && <p className="mt-2 text-foreground-muted">1回のリライトで入れられる内部リンクは{MAX_INTERNAL_LINKS_PER_REWRITE}件までです。</p>}
      </div>
    </details>
  );
}
