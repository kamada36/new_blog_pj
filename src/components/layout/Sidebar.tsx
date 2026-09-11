import Image from "next/image";
import Link from "next/link";
import {
  getArchiveMonths,
  getCategories,
  getPopularArticles,
  getPrimaryAuthor,
} from "@/lib/queries";
import { IconMug } from "@/components/icons/CafeIcons";

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export async function Sidebar() {
  const [popular, archive, categories, author] = await Promise.all([
    getPopularArticles(5),
    getArchiveMonths(),
    getCategories(),
    getPrimaryAuthor(),
  ]);

  return (
    <aside className="flex flex-col gap-8">
      {author && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-bold text-foreground-muted">管理人プロフィール</h2>
          <div className="mt-3 flex items-center gap-3">
            {author.avatarUrl ? (
              <Image
                src={author.avatarUrl}
                alt={author.name}
                width={56}
                height={56}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
                <IconMug className="h-6 w-6 text-accent-dark" />
              </div>
            )}
            <p className="font-display font-bold">{author.name}</p>
          </div>
          <p className="mt-3 line-clamp-4 text-sm text-foreground-muted">{author.bio}</p>
          <Link href="/profile" className="mt-3 inline-block text-sm font-semibold text-accent-dark hover:underline">
            プロフィールを見る →
          </Link>
        </section>
      )}

      {popular.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-bold text-foreground-muted">人気記事</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {popular.map((article, index) => (
              <li key={article.id}>
                <Link href={`/articles/${article.slug}`} className="group flex items-start gap-3">
                  <span className="font-display text-lg font-black text-accent-soft group-hover:text-accent">
                    {index + 1}
                  </span>
                  <span className="line-clamp-2 text-sm font-medium group-hover:text-accent-dark">
                    {article.title}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground-muted">カテゴリー</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/category/${category.slug}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted hover:text-accent-dark"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {archive.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-bold text-foreground-muted">アーカイブ</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {archive.map((entry) => (
              <li key={`${entry.year}-${entry.month}`}>
                <Link
                  href={`/archive/${entry.year}/${entry.month}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted hover:text-accent-dark"
                >
                  <span>
                    {entry.year}年{MONTH_NAMES[entry.month - 1]}
                  </span>
                  <span className="text-foreground-muted">{entry.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
