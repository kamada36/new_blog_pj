"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconDashboard } from "@/components/icons/CafeIcons";
import { Container } from "@/components/layout/Container";
import { clearAdminFlag, hasAdminFlag } from "@/lib/adminFlag";

// 公開ページの上部に出る、管理者向けの黒いバー(「ダッシュボードへ」「〇〇としてログイン中」)。
// 公開ページはキャッシュして全員に同じHTMLを返すため、ログイン状態はブラウザ側で取得する。
// 管理者の目印のCookieがない閲覧者は、何も取得せず、何も表示しない。
export function AdminBar() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAdminFlag()) return;
    let cancelled = false;
    fetch("/admin/api/me/", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as { name?: string };
          if (!cancelled && data.name) setName(data.name);
        } else if (res.status === 401 || res.status === 404) {
          clearAdminFlag(); // セッションが切れているのに、目印だけが残っていた
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!name) return null;

  return (
    <div className="bg-neutral-900 text-neutral-100">
      <Container className="flex h-8 items-center justify-between text-xs">
        <Link href="/admin" className="flex items-center gap-1.5 font-medium hover:text-accent">
          <IconDashboard className="h-3.5 w-3.5" />
          ダッシュボードへ
        </Link>
        <span className="hidden text-neutral-400 sm:inline">{name} としてログイン中</span>
      </Container>
    </div>
  );
}
