"use client";

import { IconClose, IconMug } from "@/components/icons/CafeIcons";
import { useMobileUI } from "@/components/layout/MobileUIProvider";

export function MobileMenuDrawer({ children }: { children: React.ReactNode }) {
  const { activePanel, close } = useMobileUI();
  const isOpen = activePanel === "menu";

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
        className={`absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-background shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <IconMug className="h-5 w-5 text-accent" />
            <span className="font-display text-sm font-bold">メニュー</span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="メニューを閉じる"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-accent hover:text-accent-dark"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6">{children}</div>
      </div>
    </div>
  );
}
