import Link from "next/link";
import { getCategories, getSiteSetting } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { IconMug, IconDashboard } from "@/components/icons/CafeIcons";
import { Container } from "@/components/layout/Container";
import { MobileHeaderActions } from "@/components/layout/MobileHeaderActions";

export async function Header() {
  const [categories, siteSetting, sessionUser] = await Promise.all([
    getCategories(),
    getSiteSetting(),
    getSessionUser(),
  ]);

  const navLinks = [
    { href: "/", label: "ホーム" },
    { href: "/about", label: "サイト概要" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      {sessionUser && (
        <div className="bg-neutral-900 text-neutral-100">
          <Container className="flex h-8 items-center justify-between text-xs">
            <Link href="/admin" className="flex items-center gap-1.5 font-medium hover:text-accent">
              <IconDashboard className="h-3.5 w-3.5" />
              ダッシュボードへ
            </Link>
            <span className="hidden text-neutral-400 sm:inline">{sessionUser.name} としてログイン中</span>
          </Container>
        </div>
      )}
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {siteSetting.headerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 幅が不定のロゴを高さ固定で出すため素のimgを使う
            <img src={siteSetting.headerLogoUrl} alt="" className="h-8 w-auto max-w-[8rem] object-contain" />
          ) : (
            <IconMug className="h-7 w-7 text-accent" />
          )}
          <span className="font-display text-lg font-bold tracking-tight">{siteSetting.siteName}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-accent-dark transition-colors">
              {link.label}
            </Link>
          ))}
          <div className="group relative">
            <button type="button" className="flex items-center gap-1 hover:text-accent-dark transition-colors">
              カテゴリー
            </button>
            <div className="invisible absolute left-1/2 top-full z-50 w-56 -translate-x-1/2 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
              <div className="rounded-xl border border-border bg-surface p-2 shadow-lg">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/category/${category.slug}`}
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <Link href="/profile" className="hover:text-accent-dark transition-colors">
            プロフィール
          </Link>
          <Link
            href="/contact"
            className="rounded-full bg-accent px-4 py-2 text-accent-contrast hover:bg-accent-dark transition-colors"
          >
            お問い合わせ
          </Link>
        </nav>

        <MobileHeaderActions />
      </Container>
    </header>
  );
}
