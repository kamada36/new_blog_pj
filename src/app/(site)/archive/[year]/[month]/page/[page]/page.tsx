import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ArchiveListing, archiveMetadata, parsePageParam } from "@/components/article/listings";

// 月別アーカイブの2ページ目以降(/archive/{年}/{月}/page/N/ )。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/archive/[year]/[month]/page/[page]">): Promise<Metadata> {
  const { year, month, page } = await params;
  return archiveMetadata(year, month, parsePageParam(page) ?? 1);
}

export default async function ArchivePageN({ params }: PageProps<"/archive/[year]/[month]/page/[page]">) {
  const { year, month, page: raw } = await params;
  const page = parsePageParam(raw);
  if (page === null) notFound();
  if (page === 1) permanentRedirect(`/archive/${year}/${month}/`);
  return <ArchiveListing year={year} month={month} page={page} />;
}
