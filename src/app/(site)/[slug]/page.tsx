import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { StaticPageView } from "@/components/page/StaticPageView";
import { getPageBySlug, getShortcodes } from "@/lib/queries";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(decodeURIComponent(slug));
  if (!page) return {};
  return {
    title: page.metaTitle || page.title,
    description: page.metaDescription,
  };
}

export default async function StaticPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const [page, shortcodes] = await Promise.all([getPageBySlug(decodeURIComponent(slug)), getShortcodes()]);
  if (!page) notFound();
  return <StaticPageView title={page.title} markdown={page.contentMarkdown} shortcodes={shortcodes} />;
}
