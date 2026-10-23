import Image from "next/image";
import Link from "next/link";
import { contentPath } from "@/lib/slug";
import { formatDate } from "@/lib/format";
import { IconMug } from "@/components/icons/CafeIcons";
import type { ArticleCardData } from "@/components/article/ArticleCard";
import { AdminViewStats } from "@/components/admin/AdminViewStats";

const THUMB_SIZE = {
  md: "h-[70px] w-[124px]",
  sm: "h-[48px] w-[86px]",
} as const;

export function ArticleRowCard({
  article,
  size = "md",
}: {
  article: ArticleCardData;
  size?: keyof typeof THUMB_SIZE;
}) {
  return (
    <Link href={contentPath(article.slug)} className="group flex items-center gap-3">
      <div className={`relative ${THUMB_SIZE[size]} shrink-0 overflow-hidden rounded-lg bg-surface-muted`}>
        {article.coverImageUrl ? (
          <Image
            src={article.coverImageUrl}
            alt={article.title}
            fill
            sizes="140px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <IconMug className="h-5 w-5 text-accent/50" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-accent-dark">
          {article.title}
        </p>
        <time className="text-xs text-foreground-muted">{formatDate(article.publishedAt)}</time>
        {/* 管理者(ブラウザ側で判定)にだけ、閲覧数が出る */}
        <AdminViewStats articleId={article.id} variant="row" />
      </div>
    </Link>
  );
}
