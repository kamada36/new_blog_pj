"use client";

import { IconClose, IconSearch } from "@/components/icons/CafeIcons";
import { useMobileUI } from "@/components/layout/MobileUIProvider";

export function MobileSearchOverlay() {
  const { activePanel, close } = useMobileUI();
  const isOpen = activePanel === "search";

  return (
    <div
      className={`fixed inset-0 z-[60] md:hidden ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        onClick={close}
        className={`absolute inset-0 bg-foreground/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 top-0 border-b border-border bg-background px-5 pb-6 pt-5 shadow-2xl transition-all duration-300 ease-out ${
          isOpen ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-bold">記事を検索</span>
          <button
            type="button"
            onClick={close}
            aria-label="検索を閉じる"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-accent hover:text-accent-dark"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <form action="/search" method="GET" className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
            <IconSearch className="h-4 w-4 shrink-0 text-foreground-muted" />
            <input
              type="text"
              name="q"
              autoFocus={isOpen}
              placeholder="キーワードを入力"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
          >
            検索
          </button>
        </form>
      </div>
    </div>
  );
}
