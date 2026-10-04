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

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const siteSetting = await getSiteSetting();

  return (
    <MobileUIProvider>
      <GoogleAnalytics />
      <Header />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      {siteSetting.sponsorFooterEmbed && (
        <Container className="flex justify-center py-6">
          <SponsorEmbed html={siteSetting.sponsorFooterEmbed} />
        </Container>
      )}
      <Footer />

      <MobileBottomNav />
      <MobileMenuDrawer>
        <Sidebar />
      </MobileMenuDrawer>
      <MobileSearchOverlay />
    </MobileUIProvider>
  );
}
