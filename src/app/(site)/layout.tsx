import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";
import { SponsorEmbed } from "@/components/layout/SponsorEmbed";
import { getSiteSetting } from "@/lib/queries";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const siteSetting = await getSiteSetting();

  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      {siteSetting.sponsorFooterEmbed && (
        <Container className="flex justify-center py-6">
          <SponsorEmbed html={siteSetting.sponsorFooterEmbed} />
        </Container>
      )}
      <Footer />
    </>
  );
}
