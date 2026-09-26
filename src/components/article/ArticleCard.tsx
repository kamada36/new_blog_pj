import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { IconMug, IconBarChart } from "@/components/icons/CafeIcons";
import type { ArticleViewStats } from "@/lib/queries";

export type ArticleCardData = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  category: { id: string; name: string; slug: string };
};

export function ArticleCard({
  article,
  viewStats,
}: {
  article: ArticleCardData;
  viewStats?: ArticleViewStats | null;
}) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-muted">
        {article.coverImageUrl ? (
          <Image
            src={article.coverImageUrl}
            alt={article.title}
            fill
            sizes="(min-width: 1024px) 340px, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <IconMug className="h-8 w-8 text-accent/50" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-contrast">
          {article.category.name}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 font-display text-sm font-bold leading-snug group-hover:text-accent-dark">
          {article.title}
        </h3>
        <time className="mt-auto pt-1 text-xs text-foreground-muted">{formatDate(article.publishedAt)}</time>
        {viewStats && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-[11px] text-foreground-muted">
            <IconBarChart className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span>本日: {viewStats.today}</span>
            <span>週: {viewStats.week}</span>
            <span>月: {viewStats.month}</span>
            <span>全体: {viewStats.total}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
