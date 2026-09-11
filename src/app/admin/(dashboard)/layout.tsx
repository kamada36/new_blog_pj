import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, destroySession } from "@/lib/auth";
import { IconMug } from "@/components/icons/CafeIcons";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/articles", label: "記事" },
  { href: "/admin/categories", label: "カテゴリー" },
  { href: "/admin/tags", label: "タグ" },
  { href: "/admin/pages", label: "固定ページ" },
  { href: "/admin/messages", label: "お問い合わせ" },
  { href: "/admin/profile", label: "プロフィール" },
  { href: "/admin/settings", label: "サイト設定" },
];

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/admin/login");
  }

  async function logoutAction() {
    "use server";
    await destroySession();
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-5 py-5">
          <IconMug className="h-6 w-6 text-accent" />
          <span className="font-display text-sm font-bold">管理ダッシュボード</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-x-auto px-3 pb-4 lg:overflow-visible">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted hover:text-accent-dark"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border px-5 py-4 text-xs text-foreground-muted">
          <p className="truncate font-medium text-foreground">{user.name}</p>
          <p className="truncate">{user.email}</p>
          <form action={logoutAction} className="mt-3">
            <button type="submit" className="text-accent-dark hover:underline">
              ログアウト
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1 px-4 py-8 sm:px-8">
        <Link href="/" target="_blank" className="text-xs text-foreground-muted hover:text-accent-dark">
          サイトを表示 →
        </Link>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
