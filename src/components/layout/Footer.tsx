import Link from "next/link";
import { getSiteSetting } from "@/lib/queries";
import { IconMug } from "@/components/icons/CafeIcons";
import { Container } from "@/components/layout/Container";

export async function Footer() {
  const siteSetting = await getSiteSetting();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-surface-muted">
      <Container className="flex flex-col items-center gap-4 py-10 text-center text-sm text-foreground-muted">
        <div className="flex items-center gap-2 text-foreground">
          <IconMug className="h-5 w-5 text-accent" />
          <span className="font-display font-bold">{siteSetting.siteName}</span>
        </div>
        <nav className="flex flex-wrap justify-center gap-4">
          <Link href="/about" className="hover:text-accent-dark">
            サイト概要
          </Link>
          <Link href="/profile" className="hover:text-accent-dark">
            プロフィール
          </Link>
          <Link href="/contact" className="hover:text-accent-dark">
            お問い合わせ
          </Link>
          <Link href="/privacy-policy" className="hover:text-accent-dark">
            プライバシーポリシー・免責事項
          </Link>
        </nav>
        <p>
          &copy; {year} {siteSetting.footerCopyright}
        </p>
      </Container>
    </footer>
  );
}
