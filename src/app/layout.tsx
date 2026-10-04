import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, Noto_Sans_JP, Dancing_Script } from "next/font/google";
import { getSiteSetting } from "@/lib/queries";
import "./globals.css";

// 日本語フォントは字形ごとに多数のファイルへ分割されている。preload を有効のままにすると、使わない分まで
// 約50本をすべて先読みしてしまうため無効にする(必要な字形だけ、CSSの unicode-range に従って読み込まれる)。
const bodyFont = Noto_Sans_JP({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

const displayFont = Zen_Kaku_Gothic_New({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  preload: false,
});

// トップページのサイト名(Resilient-cer cafe)に使う筆記体
const brandFont = Dancing_Script({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const { faviconUrl } = await getSiteSetting();
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "レジリエンサーCafe",
      template: "%s | レジリエンサーCafe",
    },
    description: "この一杯から始まる、IT転職への道しるべ。未経験からのIT転職・キャリアの考え方を発信するブログです。",
    // app/favicon.ico を置くと設定値と並んで2本出力されブラウザの選択が不定になるため、
    // 既定のファビコンは public に置き、リンクを常に1本だけにする
    icons: { icon: faviconUrl ?? "/favicon-default.ico" },
    // 現行WordPressと同じURL(/feed/)のRSS。フィードリーダーが自動で見つけられるようにする
    alternates: { types: { "application/rss+xml": "/feed/" } },
  };
}

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
