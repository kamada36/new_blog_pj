"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { bulkDeleteArticles, bulkUpdateArticleStatus, deleteArticle } from "./actions";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  published: { label: "公開中", className: "bg-accent-soft text-accent-dark" },
  private: { label: "非公開", className: "bg-red-50 text-red-600" },
  draft: { label: "下書き", className: "bg-surface-muted text-foreground-muted" },
};

type ArticleRow = {
  id: string;
  title: string;
  status: string;
  viewCount: number;
  updatedAt: Date;
  category: { name: string };
};

export function ArticlesTable({ articles }: { articles: ArticleRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<"draft" | "published" | "private">("published");
  const [isPending, startTransition] = useTransition();

  const allSelected = articles.length > 0 && selected.size === articles.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(articles.map((article) => article.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`選択した${selected.size}件の記事を削除します。よろしいですか？`)) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      await bulkDeleteArticles(ids);
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleBulkStatus() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      await bulkUpdateArticleStatus(ids, bulkStatus);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm">
          <span className="font-semibold text-accent-dark">{selected.size}件選択中</span>
          <div className="flex items-center gap-2">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as typeof bulkStatus)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="published">公開</option>
              <option value="draft">下書き</option>
              <option value="private">非公開</option>
            </select>
            <button
              type="button"
              onClick={handleBulkStatus}
              disabled={isPending}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-60"
            >
              ステータス変更
            </button>
          </div>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isPending}
            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            削除
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-surface-muted text-left text-xs font-semibold text-foreground-muted">
            <tr>
              <th className="px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="すべて選択" />
              </th>
              <th className="px-4 py-3">タイトル</th>
              <th className="px-4 py-3">カテゴリー</th>
              <th className="px-4 py-3">状態</th>
              <th className="px-4 py-3">閲覧数</th>
              <th className="px-4 py-3">更新日</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(article.id)}
                    onChange={() => toggleOne(article.id)}
                    aria-label={`${article.title}を選択`}
                  />
                </td>
                <td className="max-w-xs truncate px-4 py-3 font-medium">{article.title}</td>
                <td className="px-4 py-3 text-foreground-muted">{article.category.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      (STATUS_BADGES[article.status] ?? STATUS_BADGES.draft).className
                    }`}
                  >
                    {(STATUS_BADGES[article.status] ?? STATUS_BADGES.draft).label}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground-muted">{article.viewCount}</td>
                <td className="px-4 py-3 text-foreground-muted">{formatDate(article.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/admin/articles/${article.id}`} className="text-accent-dark hover:underline">
                      編集
                    </Link>
                    <form action={deleteArticle.bind(null, article.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="この記事を削除します。よろしいですか？"
                        className="text-red-600 hover:underline"
                      >
                        削除
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {articles.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-foreground-muted">条件に一致する記事がありません。</p>
        )}
      </div>
    </div>
  );
}
