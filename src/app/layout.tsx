import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, Noto_Sans_JP, Dancing_Script } from "next/font/google";
import "./globals.css";

const bodyFont = Noto_Sans_JP({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const displayFont = Zen_Kaku_Gothic_New({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

// トップページのサイト名(Resilient-cer cafe)に使う筆記体
const brandFont = Dancing_Script({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "レジリエンサーCafe",
    template: "%s | レジリエンサーCafe",
  },
  description: "この一杯から始まる、IT転職への道しるべ。未経験からのIT転職・キャリアの考え方を発信するブログです。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${bodyFont.variable} ${displayFont.variable} ${brandFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
