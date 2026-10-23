import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { CategoryListing, categoryMetadata, parsePageParam } from "@/components/article/listings";

// カテゴリーの2ページ目以降(旧WordPressと同じ /category/{slug}/page/N/ )。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]/page/[page]">): Promise<Metadata> {
  const { slug, page } = await params;
  return categoryMetadata(slug, parsePageParam(page) ?? 1);
}

export default async function CategoryPageN({ params }: PageProps<"/category/[slug]/page/[page]">) {
  const { slug, page: raw } = await params;
  const page = parsePageParam(raw);
  if (page === null) notFound();
  if (page === 1) permanentRedirect(`/category/${slug}/`); // 1ページ目は、ページ番号のないURLに統一する
  return <CategoryListing slug={slug} page={page} />;
}
