import Image from "next/image";
import Link from "next/link";
import { contentPath } from "@/lib/slug";
import { formatDate } from "@/lib/format";
import { IconMug } from "@/components/icons/CafeIcons";
import { AdminViewStats } from "@/components/admin/AdminViewStats";

export type ArticleCardData = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  category: { id: string; name: string; slug: string };
};

export function ArticleCard({ article }: { article: ArticleCardData }) {
  return (
    <Link
      href={contentPath(article.slug)}
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
        {/* 管理者(ブラウザ側で判定)にだけ、閲覧数が出る */}
        <AdminViewStats articleId={article.id} />
      </div>
    </Link>
  );
}
