import type { Metadata } from "next";
import { Dancing_Script } from "next/font/google";
import { getSiteSetting } from "@/lib/queries";
import "./globals.css";

// 日本語のWebフォント(Noto Sans JPなど)は、字形ごとに数十〜百以上のファイルへ分割されていて、ページが使う文字の分だけ
// 30〜40ファイル・700〜900KBを読み込む。さらに、その定義だけで約120KBのCSSになり、表示をブロックする。
// モバイル回線では、これが表示の遅れの最大の原因だったため、本文・見出しとも、閲覧する端末の標準の日本語フォントを使う
// (フォントの指定は globals.css の --font-body)。筆記体のロゴ文字(Dancing Script)は、英字だけで軽いので、そのまま読み込む。

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
      className={`${brandFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
