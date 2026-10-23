"use client";

import { useEffect } from "react";
import { hasAdminFlag } from "@/lib/adminFlag";

// 記事ページを表示したブラウザから、閲覧を1回だけ記録しに行く(サーバー側のページはキャッシュされるため)。
// JavaScriptが動かないボット・クローラーや、先読み(prefetch)では実行されないので、実際の表示だけが数えられる。
// 管理者(目印のCookieあり)は送らない。サーバー側でも、ボットのUser-Agent・管理者のセッションは除外している。
export function ViewBeacon({ articleId }: { articleId: string }) {
  useEffect(() => {
    if (hasAdminFlag()) return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return; // 自動操作のブラウザ(ボットの多くが該当)
    fetch("/api/views/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
      keepalive: true,
    }).catch(() => {});
  }, [articleId]);

  return null;
}
