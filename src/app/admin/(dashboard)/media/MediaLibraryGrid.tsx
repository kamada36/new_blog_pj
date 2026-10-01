"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaCheck } from "react-icons/fa6";
import { bulkDeleteMedia, deleteMedia, type MediaRow, type MediaUsageType } from "./actions";
import { MediaDetailModal } from "./MediaDetailModal";

type UsageFilter = "all" | "used" | "unused";
type TypeFilter = "all" | MediaUsageType;

const USAGE_FILTER_OPTIONS: { value: UsageFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "used", label: "使用中" },
  { value: "unused", label: "未使用" },
];

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "article", label: "記事用" },
  { value: "setting", label: "設定用" },
];

export function MediaLibraryGrid({ media }: { media: MediaRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<MediaRow | null>(null);
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [isPending, startTransition] = useTransition();

  const filteredMedia = useMemo(() => {
    return media.filter((item) => {
      if (usageFilter === "used" && !item.isUsed) return false;
      if (usageFilter === "unused" && item.isUsed) return false;
      if (typeFilter !== "all" && item.usageType !== typeFilter) return false;
      return true;
    });
  }, [media, usageFilter, typeFilter]);

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
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground-muted">使用状況:</span>
        {USAGE_FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setUsageFilter(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              usageFilter === option.value
                ? "border-accent bg-accent-soft text-accent-dark"
                : "border-border text-foreground-muted hover:border-accent hover:text-accent-dark"
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="text-xs text-foreground-muted">{filteredMedia.length}件</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground-muted">用途:</span>
        {TYPE_FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTypeFilter(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              typeFilter === option.value
                ? "border-accent bg-accent-soft text-accent-dark"
                : "border-border text-foreground-muted hover:border-accent hover:text-accent-dark"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

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
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark"
          >
            選択解除
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {filteredMedia.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <div key={item.id} className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-1.5">
              <button
                type="button"
                onClick={() => toggleOne(item.id)}
                aria-pressed={isSelected}
                aria-label={`${item.filename}を選択`}
                className={`relative aspect-square w-full overflow-hidden rounded-md bg-surface-muted ${
                  isSelected ? "ring-2 ring-accent" : ""
                }`}
              >
                <Image src={item.url} alt={item.altText} fill sizes="120px" className="object-cover" unoptimized />
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center bg-accent/30">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-contrast">
                      <FaCheck className="h-3.5 w-3.5" />
                    </span>
                  </span>
                )}
                {item.isUsed && (
                  <span
                    title="記事で使用されています"
                    className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setDetailItem(item)}
                className="line-clamp-1 text-left text-[10px] text-foreground-muted hover:text-accent-dark hover:underline"
              >
                {item.filename}
              </button>
            </div>
          );
        })}
        {filteredMedia.length === 0 && (
          <p className="col-span-full text-sm text-foreground-muted">
            {media.length === 0 ? "まだメディアがアップロードされていません。" : "条件に一致する画像がありません。"}
          </p>
        )}
      </div>

      {detailItem && (
        <MediaDetailModal item={detailItem} onClose={() => setDetailItem(null)} onDelete={handleDeleteFromModal} />
      )}
    </div>
  );
}
