"use client";

import { IconSearch, IconMenu, IconClose } from "@/components/icons/CafeIcons";
import { useMobileUI } from "@/components/layout/MobileUIProvider";

export function MobileHeaderActions() {
  const { activePanel, openMenu, openSearch } = useMobileUI();

  return (
    <div className="hero-reveal flex items-center gap-2 md:hidden">
      <button
        type="button"
        onClick={openSearch}
        aria-label="検索を開く"
        aria-pressed={activePanel === "search"}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-accent hover:text-accent-dark"
      >
        <IconSearch className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={openMenu}
        aria-label={activePanel === "menu" ? "メニューを閉じる" : "メニューを開く"}
        aria-pressed={activePanel === "menu"}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-accent hover:text-accent-dark"
      >
        {activePanel === "menu" ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
      </button>
    </div>
  );
}
