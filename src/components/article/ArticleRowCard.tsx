import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { IconMug, IconBarChart } from "@/components/icons/CafeIcons";
import type { ArticleCardData } from "@/components/article/ArticleCard";
import type { ArticleViewStats } from "@/lib/queries";

const THUMB_SIZE = {
  md: "h-[70px] w-[124px]",
  sm: "h-[48px] w-[86px]",
} as const;

export function ArticleRowCard({
  article,
  size = "md",
  viewStats,
}: {
  article: ArticleCardData;
  size?: keyof typeof THUMB_SIZE;
  viewStats?: ArticleViewStats | null;
}) {
  return (
    <Link href={`/articles/${article.slug}`} className="group flex items-center gap-3">
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
        {viewStats && (
          <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-foreground-muted">
            <IconBarChart className="h-3 w-3 shrink-0 text-accent" />
            <span>本日:{viewStats.today}</span>
            <span>週:{viewStats.week}</span>
            <span>月:{viewStats.month}</span>
            <span>全体:{viewStats.total}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
