import Link from "next/link";

/**
 * ページ送り。
 *   - basePath に「?」を含まない場合(カテゴリー・タグ・月別): パス形式。1ページ目は `${basePath}/`、
 *     2ページ目以降は `${basePath}/page/N/`(旧WordPressと同じ形。ページがキャッシュされ、速く表示される)。
 *   - basePath に「?」を含む場合(検索結果): `${basePath}&page=N` のクエリ形式(検索語ごとに結果が変わるため、動的に生成される)。
 */
export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const queryMode = basePath.includes("?");
  const hrefFor = (p: number) => {
    if (queryMode) return p === 1 ? basePath : `${basePath}&page=${p}`;
    return p === 1 ? `${basePath}/` : `${basePath}/page/${p}/`;
  };

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="ページネーション">
      {pages.map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm font-medium ${
            p === page
              ? "border-accent bg-accent text-accent-contrast"
              : "border-border bg-surface hover:border-accent hover:text-accent-dark"
          }`}
          aria-current={p === page ? "page" : undefined}
        >
          {p}
        </Link>
      ))}
    </nav>
  );
}
