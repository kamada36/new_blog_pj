import type { Metadata } from "next";
import { TagListing, tagMetadata } from "@/components/article/listings";

// ISR: 最初のアクセスで生成してキャッシュする(ビルド時にはDBを読まない)。ページ送りは /tag/{slug}/page/N/ 。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/tag/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return tagMetadata(slug, 1);
}

export default async function TagPage({ params }: PageProps<"/tag/[slug]">) {
  const { slug } = await params;
  return <TagListing slug={slug} page={1} />;
}
