import type { Metadata } from "next";
import { Noto_Sans_JP, Dancing_Script } from "next/font/google";
import { getSiteSetting } from "@/lib/queries";
import "./globals.css";

// 日本語フォントは字形ごとに多数のファイルへ分割されている。ページが使う文字の分だけ、何十個も読み込まれるため、
// フォントの種類と太さを増やすほど、転送量(と表示の遅さ)が増える。
//   - 本文と見出しは、同じ Noto Sans JP 1種類にする。Googleは、太さが違っても、可変フォントの同じファイルを返すため、
//     太さを増やしても、読み込むファイルは増えない(ビルド後に、太さ違いで同じファイルを参照することを確認済み)。
//     以前は、見出し用に Zen Kaku Gothic New を別に読み込んでいて、約40ファイル・約0.6MBが余分にかかっていた。
//   - 太さを指定せずに可変フォントとして読み込むと、Next.jsの取得処理が失敗するため、使う太さを指定する。
//     900は見出し(font-black)、700は太字と見出し、500・400は本文。
//   - preload は無効にする(使わない分まで、約50本をすべて先読みしてしまうため)。
const bodyFont = Noto_Sans_JP({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
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
      className={`${bodyFont.variable} ${brandFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
