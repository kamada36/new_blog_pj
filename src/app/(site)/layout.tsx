import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";
import { Sidebar } from "@/components/layout/Sidebar";
import { SponsorEmbed } from "@/components/layout/SponsorEmbed";
import { MobileUIProvider } from "@/components/layout/MobileUIProvider";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileMenuDrawer } from "@/components/layout/MobileMenuDrawer";
import { MobileSearchOverlay } from "@/components/layout/MobileSearchOverlay";
import { getSiteSetting } from "@/lib/queries";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

// 公開ページは、ログイン状態や閲覧者ごとの情報に依存しない(同じHTMLを全員に返す)ため、CDNにキャッシュできる。
// 5分ごとに裏で再生成する(ISR)。管理画面で記事などを保存したときは、revalidatePath で即時に更新する。
// searchParams を使うページ(カテゴリー・タグ・月別・検索)は、動的に生成される。
export const revalidate = 300;

// フッター上の広告枠。レイアウト本体で getSiteSetting を待つと、その間ページ本体の描画が始まらず、
// DBまでの往復の遅延がそのまま上乗せされるため、別コンポーネントに分けて並行して取得する。
async function FooterSponsor() {
  const { sponsorFooterEmbed } = await getSiteSetting();
  if (!sponsorFooterEmbed) return null;
  return (
    <Container className="flex justify-center py-6">
      <SponsorEmbed html={sponsorFooterEmbed} />
    </Container>
  );
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileUIProvider>
      <GoogleAnalytics />
      <Header />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <FooterSponsor />
      <Footer />

      <MobileBottomNav />
      <MobileMenuDrawer>
        <Sidebar />
      </MobileMenuDrawer>
      <MobileSearchOverlay />
    </MobileUIProvider>
  );
}
