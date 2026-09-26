"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconMenu,
  IconClose,
  IconSearch,
  IconHome,
  IconArrowUp,
  IconMail,
} from "@/components/icons/CafeIcons";
import { useMobileUI } from "@/components/layout/MobileUIProvider";

const SHOW_AT_TOP_THRESHOLD = 80;

export function MobileBottomNav() {
  const { activePanel, openMenu, openSearch } = useMobileUI();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function handleScroll() {
      const currentY = window.scrollY;
      const goingDown = currentY > lastScrollY.current;

      if (currentY <= SHOW_AT_TOP_THRESHOLD) {
        setVisible(true);
      } else if (goingDown) {
        setVisible(false);
      } else {
        setVisible(true);
      }

      lastScrollY.current = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const itemClass =
    "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-foreground-muted transition-colors hover:text-accent-dark";

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur transition-transform duration-300 ease-out md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-label="モバイルナビゲーション"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        <button
          type="button"
          onClick={openMenu}
          aria-pressed={activePanel === "menu"}
          className={itemClass}
        >
          {activePanel === "menu" ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
          メニュー
        </button>
        <button
          type="button"
          onClick={openSearch}
          aria-pressed={activePanel === "search"}
          className={itemClass}
        >
          <IconSearch className="h-5 w-5" />
          検索
        </button>
        <Link href="/" className={itemClass}>
          <IconHome className="h-5 w-5" />
          ホーム
        </Link>
        <button type="button" onClick={scrollToTop} className={itemClass}>
          <IconArrowUp className="h-5 w-5" />
          トップ
        </button>
        <Link href="/contact" className={itemClass}>
          <IconMail className="h-5 w-5" />
          お問い合わせ
        </Link>
      </div>
    </nav>
  );
}
