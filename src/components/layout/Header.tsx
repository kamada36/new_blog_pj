import Link from "next/link";
import { getCategories, getSiteSetting } from "@/lib/queries";
import { IconMug } from "@/components/icons/CafeIcons";
import { Container } from "@/components/layout/Container";

export async function Header() {
  const [categories, siteSetting] = await Promise.all([getCategories(), getSiteSetting()]);

  const navLinks = [
    { href: "/", label: "ホーム" },
    { href: "/about", label: "サイト概要" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <IconMug className="h-7 w-7 text-accent" />
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

        <label
          htmlFor="nav-toggle"
          className="md:hidden flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border"
          aria-label="メニューを開く"
        >
          <span className="sr-only">メニュー</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </label>
      </Container>

      <input id="nav-toggle" type="checkbox" className="peer hidden" />
      <div className="hidden border-t border-border bg-surface px-4 py-3 peer-checked:block md:hidden">
        <nav className="flex flex-col gap-1 text-sm font-medium">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 hover:bg-surface-muted">
              {link.label}
            </Link>
          ))}
          <p className="px-3 pt-2 text-xs font-semibold text-foreground-muted">カテゴリー</p>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className="rounded-lg px-3 py-2 hover:bg-surface-muted"
            >
              {category.name}
            </Link>
          ))}
          <Link href="/profile" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            プロフィール
          </Link>
          <Link href="/contact" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            お問い合わせ
          </Link>
        </nav>
      </div>
    </header>
  );
}
