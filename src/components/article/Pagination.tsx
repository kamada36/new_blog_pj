import Link from "next/link";

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

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="ページネーション">
      {pages.map((p) => (
        <Link
          key={p}
          href={p === 1 ? basePath : `${basePath}?page=${p}`}
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
