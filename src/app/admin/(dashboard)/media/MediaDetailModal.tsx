"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { updateMedia, type MediaRow } from "./actions";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function MediaDetailModal({
  item,
  onClose,
  onDelete,
}: {
  item: MediaRow;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const [filename, setFilename] = useState(item.filename);
  const [altText, setAltText] = useState(item.altText);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSave() {
    const formData = new FormData();
    formData.set("filename", filename);
    formData.set("altText", altText);
    startSaving(async () => {
      const result = await updateMedia(item.id, formData);
      if (result.status === "error") {
        setMessage({ type: "error", text: result.message });
      } else {
        setMessage({ type: "ok", text: "保存しました。" });
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("この画像を削除します。記事本文で使用している場合、表示できなくなります。よろしいですか？")) {
      return;
    }
    onDelete(item.id);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold">メディア詳細</h2>
          <button type="button" onClick={onClose} className="text-sm text-foreground-muted hover:text-accent-dark">
            閉じる
          </button>
        </div>

        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-muted">
          <Image src={item.url} alt={item.altText} fill className="object-contain" unoptimized />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-foreground-muted">
          <p>サイズ: {formatBytes(item.size)}</p>
          <p>種類: {item.mimeType}</p>
          <p>登録日: {formatDateTime(item.createdAt)}</p>
          <p>
            状態:{" "}
            {item.isUsed ? (
              <span className="font-semibold text-accent-dark">使用中</span>
            ) : (
              <span className="text-foreground-muted">未使用</span>
            )}
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-foreground-muted">タイトル</label>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-foreground-muted">alt属性</label>
          <input
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="画像の説明(アクセシビリティ・SEO用)"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {message && (
          <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-accent-dark"}`}>
            {message.text}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-60"
          >
            {isSaving ? "保存中..." : "保存する"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm font-semibold text-red-600 hover:underline"
          >
            この画像を削除
          </button>
        </div>

        <div className="border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-foreground-muted">使用されている記事({item.usedBy.length}件)</h3>
          {item.usedBy.length === 0 ? (
            <p className="mt-2 text-sm text-foreground-muted">どの記事でも使用されていません。</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {item.usedBy.map((article) => (
                <li key={article.id}>
                  <Link
                    href={`/admin/articles/${article.id}`}
                    className="text-sm text-accent-dark hover:underline"
                  >
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
