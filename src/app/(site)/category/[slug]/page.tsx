import type { Metadata } from "next";
import { CategoryListing, categoryMetadata } from "@/components/article/listings";

// ISR: 最初のアクセスで生成してキャッシュする(ビルド時にはDBを読まない)。ページ送りは /category/{slug}/page/N/ 。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return categoryMetadata(slug, 1);
}

export default async function CategoryPage({ params }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  return <CategoryListing slug={slug} page={1} />;
}
