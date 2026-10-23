import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { TagListing, parsePageParam, tagMetadata } from "@/components/article/listings";

// タグの2ページ目以降(旧WordPressと同じ /tag/{slug}/page/N/ )。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/tag/[slug]/page/[page]">): Promise<Metadata> {
  const { slug, page } = await params;
  return tagMetadata(slug, parsePageParam(page) ?? 1);
}

export default async function TagPageN({ params }: PageProps<"/tag/[slug]/page/[page]">) {
  const { slug, page: raw } = await params;
  const page = parsePageParam(raw);
  if (page === null) notFound();
  if (page === 1) permanentRedirect(`/tag/${slug}/`);
  return <TagListing slug={slug} page={page} />;
}
