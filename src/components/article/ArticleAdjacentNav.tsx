import { ArticleRowCard } from "@/components/article/ArticleRowCard";
import type { ArticleCardData } from "@/components/article/ArticleCard";

export function ArticleAdjacentNav({
  prev,
  next,
}: {
  prev: ArticleCardData | null;
  next: ArticleCardData | null;
}) {
  if (!prev && !next) return null;

  return (
    <nav className="mt-12 grid grid-cols-1 gap-4 border-t border-border pt-8 sm:grid-cols-2" aria-label="前後の記事">
      {prev && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="mb-3 text-xs font-semibold text-foreground-muted">← 前の記事</p>
          <ArticleRowCard article={prev} />
        </div>
      )}
      {next && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="mb-3 text-xs font-semibold text-foreground-muted">次の記事 →</p>
          <ArticleRowCard article={next} />
        </div>
      )}
    </nav>
  );
}
