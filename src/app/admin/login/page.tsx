import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IconMug } from "@/components/icons/CafeIcons";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

// ログインページは、検索エンジンに載せない
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  // ログイン入口を秘密のURLへ移している場合、そのURLはproxyを通らないため、ログイン済みかどうかはここで判定する
  if (await getSessionUser()) redirect("/admin");

  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <IconMug className="h-8 w-8 text-accent" />
          <h1 className="font-display text-lg font-bold">管理画面ログイン</h1>
          <p className="text-xs text-foreground-muted">レジリエンサーCafe 管理者専用ページ</p>
        </div>
        <div className="mt-6">
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>
      </div>
    </div>
  );
}
