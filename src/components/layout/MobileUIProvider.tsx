"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Panel = "menu" | "search" | null;

type MobileUIContextValue = {
  activePanel: Panel;
  openMenu: () => void;
  openSearch: () => void;
  close: () => void;
};

const MobileUIContext = createContext<MobileUIContextValue | null>(null);

export function MobileUIProvider({ children }: { children: React.ReactNode }) {
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // ページ遷移したらパネルは自動的に閉じる(レンダー中に判定して更新する)
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setActivePanel(null);
  }

  // メニュー/検索パネルを開いている間は背面のスクロールを止める
  useEffect(() => {
    document.body.style.overflow = activePanel ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activePanel]);

  const value: MobileUIContextValue = {
    activePanel,
    openMenu: () => setActivePanel((prev) => (prev === "menu" ? null : "menu")),
    openSearch: () => setActivePanel((prev) => (prev === "search" ? null : "search")),
    close: () => setActivePanel(null),
  };

  return <MobileUIContext.Provider value={value}>{children}</MobileUIContext.Provider>;
}

export function useMobileUI() {
  const context = useContext(MobileUIContext);
  if (!context) {
    throw new Error("useMobileUI must be used within a MobileUIProvider");
  }
  return context;
}
