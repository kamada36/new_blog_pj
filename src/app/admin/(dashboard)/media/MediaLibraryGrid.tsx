"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { bulkDeleteMedia, deleteMedia, type MediaRow } from "./actions";
import { MediaDetailModal } from "./MediaDetailModal";

export function MediaLibraryGrid({ media }: { media: MediaRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<MediaRow | null>(null);
  const [isPending, startTransition] = useTransition();

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
    if (!window.confirm(`選択した${selected.size}件の画像を削除します。記事本文で使用している場合、表示できなくなります。よろしいですか？`)) {
      return;
    }
    const ids = Array.from(selected);
    startTransition(async () => {
      await bulkDeleteMedia(ids);
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleDeleteFromModal(id: string) {
    setDetailItem(null);
    startTransition(async () => {
      await deleteMedia(id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm">
          <span className="font-semibold text-accent-dark">{selected.size}件選択中</span>
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

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {media.map((item) => (
          <div key={item.id} className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-1.5">
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-muted">
              <button
                type="button"
                onClick={() => setDetailItem(item)}
                className="absolute inset-0"
                title={item.filename}
              >
                <Image src={item.url} alt={item.altText} fill sizes="120px" className="object-cover" unoptimized />
              </button>
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleOne(item.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`${item.filename}を選択`}
                className="absolute left-1 top-1 h-4 w-4 accent-accent"
              />
              {item.isUsed && (
                <span
                  title="記事で使用されています"
                  className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white"
                />
              )}
            </div>
            <p className="line-clamp-1 text-[10px] text-foreground-muted">{item.filename}</p>
          </div>
        ))}
        {media.length === 0 && (
          <p className="col-span-full text-sm text-foreground-muted">まだメディアがアップロードされていません。</p>
        )}
      </div>

      {detailItem && (
        <MediaDetailModal item={detailItem} onClose={() => setDetailItem(null)} onDelete={handleDeleteFromModal} />
      )}
    </div>
  );
}
