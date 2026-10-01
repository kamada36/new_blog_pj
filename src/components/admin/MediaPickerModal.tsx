"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { listMedia, uploadMedia, type MediaItem } from "@/app/admin/(dashboard)/media/actions";

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, startLoad] = useTransition();
  const [isUploading, startUpload] = useTransition();

  useEffect(() => {
    if (!open) return;
    startLoad(async () => {
      const data = await listMedia();
      setItems(data);
    });
  }, [open]);

  function handleUpload(formData: FormData) {
    startUpload(async () => {
      await uploadMedia(formData);
      const data = await listMedia();
      setItems(data);
    });
  }

  if (!open) return null;

  // 記事編集フォーム(<form>)の内側から開かれるため、HTML上<form>を入れ子にできない。
  // document.bodyへポータルして、DOM上は編集フォームの外側に描画する。
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold">メディアを選択</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-foreground-muted hover:text-accent-dark"
          >
            閉じる
          </button>
        </div>

        <form
          action={handleUpload}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3"
        >
          <input
            type="file"
            name="files"
            accept="image/*"
            multiple
            className="min-w-[180px] flex-1 text-xs outline-none file:mr-2 file:rounded-full file:border-0 file:bg-accent-soft file:px-2 file:py-1 file:text-xs"
          />
          <button
            type="submit"
            disabled={isUploading}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-60"
          >
            {isUploading ? "アップロード中..." : "アップロード"}
          </button>
        </form>

        <div className="mt-4 grid flex-1 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {loading && <p className="col-span-full text-sm text-foreground-muted">読み込み中...</p>}
          {!loading && items.length === 0 && (
            <p className="col-span-full text-sm text-foreground-muted">まだメディアがありません。</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              title={item.filename}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-muted"
            >
              <Image
                src={item.url}
                alt={item.altText}
                fill
                sizes="150px"
                className="object-cover transition-transform group-hover:scale-105"
                unoptimized
              />
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
