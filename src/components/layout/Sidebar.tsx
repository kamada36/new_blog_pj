import Image from "next/image";
import Link from "next/link";
import {
  getArchiveMonths,
  getCategories,
  getPopularArticles,
  getPrimaryAuthor,
  getSiteSetting,
} from "@/lib/queries";
import { getAdminViewStatsForArticles } from "@/lib/adminView";
import { IconMug, IconCap } from "@/components/icons/CafeIcons";
import { ArticleRowCard } from "@/components/article/ArticleRowCard";
import { ArticleTocWidget } from "@/components/article/ArticleTocWidget";
import { SponsorEmbed } from "@/components/layout/SponsorEmbed";
import type { TocItem } from "@/lib/toc";

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export async function Sidebar({ articleToc }: { articleToc?: TocItem[] } = {}) {
  const [popular, archive, categories, author, siteSetting] = await Promise.all([
    getPopularArticles(5),
    getArchiveMonths(),
    getCategories(),
    getPrimaryAuthor(),
    getSiteSetting(),
  ]);
  const viewStatsMap = await getAdminViewStatsForArticles(popular);
  const toc = articleToc ?? [];
  const hasStickyToc = toc.length > 0;

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
          {(author.snsX || author.snsThreads) && (
            <div className="mt-3 flex gap-2">
              {author.snsX && (
                <a
                  href={author.snsX}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-accent hover:text-accent-dark"
                >
                  X (Twitter)
                </a>
              )}
              {author.snsThreads && (
                <a
                  href={author.snsThreads}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-accent hover:text-accent-dark"
                >
                  Threads
                </a>
              )}
            </div>
          )}
          <Link href="/profile" className="mt-3 inline-block text-sm font-semibold text-accent-dark hover:underline">
            プロフィールを見る →
          </Link>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground-muted">サイトの住人</h2>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft">
            <IconCap className="h-6 w-6 text-accent-dark" />
          </div>
          <p className="font-display font-bold">アイコ</p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
          プログラミングを勉強中でエンジニアへの転職に憧れている。日々このサイト内でレジサンからITに関する様々な事を学んでいる。
        </p>
      </section>

      {siteSetting.sponsorSidebarEmbed && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-bold text-foreground-muted">スポンサーリンク</h2>
          <div className="mt-3 flex justify-center">
            <SponsorEmbed html={siteSetting.sponsorSidebarEmbed} />
          </div>
        </section>
      )}

      {popular.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-bold text-foreground-muted">人気記事</h2>
          <div className="mt-3 flex flex-col gap-4">
            {popular.map((article) => (
              <ArticleRowCard
                key={article.id}
                article={article}
                size="sm"
                viewStats={viewStatsMap?.get(article.id) ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {hasStickyToc && (
        <div className="lg:flex-1">
          <div className="flex flex-col gap-4 lg:sticky lg:top-24">
            {siteSetting.sponsorSidebarCompactEmbed && (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">広告</p>
                <div className="mt-2 flex justify-center">
                  <SponsorEmbed html={siteSetting.sponsorSidebarCompactEmbed} />
                </div>
              </section>
            )}
            <ArticleTocWidget items={toc} />
          </div>
        </div>
      )}

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
    </aside>
  );
}
