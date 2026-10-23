import type { Metadata } from "next";
import { ArchiveListing, archiveMetadata } from "@/components/article/listings";

// ISR: 最初のアクセスで生成してキャッシュする(ビルド時にはDBを読まない)。ページ送りは /archive/{年}/{月}/page/N/ 。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/archive/[year]/[month]">): Promise<Metadata> {
  const { year, month } = await params;
  return archiveMetadata(year, month, 1);
}

export default async function ArchivePage({ params }: PageProps<"/archive/[year]/[month]">) {
  const { year, month } = await params;
  return <ArchiveListing year={year} month={month} page={1} />;
}
