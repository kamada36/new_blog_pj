"use client";

import { useEffect, useSyncExternalStore } from "react";
import { IconBarChart } from "@/components/icons/CafeIcons";
import { clearAdminFlag, hasAdminFlag } from "@/lib/adminFlag";

type Stats = { today: number; week: number; month: number; total: number };

// 記事カードに出す、管理者向けの閲覧数(本日・週・月・全体)。
// ページ内のすべてのカードの分を、まとめて1回のAPI呼び出しで取得する(カードごとに呼ばない)。
// 管理者の目印のCookieがない閲覧者は、何も取得せず、何も表示しない。
const cache = new Map<string, Stats>();
const listeners = new Set<() => void>();
const queued = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

async function flush() {
  timer = null;
  const ids = [...queued].filter((id) => !cache.has(id));
  queued.clear();
  if (ids.length === 0) return;
  try {
    const res = await fetch("/admin/api/view-stats/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(0, 80) }),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 404) {
      clearAdminFlag();
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, Stats>;
    for (const [id, stats] of Object.entries(data)) cache.set(id, stats);
    notify();
  } catch {
    // 取得できなくても、公開ページの表示には影響しない
  }
}

function request(id: string) {
  if (cache.has(id)) return;
  queued.add(id);
  if (!timer) timer = setTimeout(flush, 40);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function AdminViewStats({ articleId, variant = "card" }: { articleId: string; variant?: "card" | "row" }) {
  const stats = useSyncExternalStore(
    subscribe,
    () => cache.get(articleId) ?? null,
    () => null
  );

  useEffect(() => {
    if (hasAdminFlag()) request(articleId);
  }, [articleId]);

  if (!stats) return null;

  const compact = variant === "row";
  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-x-1.5 text-[10px] text-foreground-muted"
          : "flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-[11px] text-foreground-muted"
      }
    >
      <IconBarChart className={compact ? "h-3 w-3 shrink-0 text-accent" : "h-3.5 w-3.5 shrink-0 text-accent"} />
      <span>本日{compact ? ":" : ": "}{stats.today}</span>
      <span>週{compact ? ":" : ": "}{stats.week}</span>
      <span>月{compact ? ":" : ": "}{stats.month}</span>
      <span>全体{compact ? ":" : ": "}{stats.total}</span>
    </div>
  );
}
