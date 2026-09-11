import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export default async function AdminDashboardPage() {
  const [publishedCount, draftCount, totalViewsAgg, latestMessages] = await Promise.all([
    prisma.article.count({ where: { status: "published" } }),
    prisma.article.count({ where: { status: "draft" } }),
    prisma.article.aggregate({ _sum: { viewCount: true } }),
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const stats = [
    { label: "公開中の記事", value: publishedCount },
    { label: "下書き", value: draftCount },
    { label: "累計閲覧数", value: totalViewsAgg._sum.viewCount ?? 0 },
  ];

  return (
    <div>
      <h1 className="font-display text-xl font-black">ダッシュボード</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-semibold text-foreground-muted">{stat.label}</p>
            <p className="mt-2 font-display text-3xl font-black">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold">最新のお問い合わせ</h2>
          <Link href="/admin/messages" className="text-xs font-semibold text-accent-dark hover:underline">
            すべて見る →
          </Link>
        </div>
        {latestMessages.length === 0 ? (
          <p className="mt-4 text-sm text-foreground-muted">お問い合わせはまだありません。</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {latestMessages.map((message) => (
              <li key={message.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{message.name}</span>
                  <span className="text-xs text-foreground-muted">{formatDate(message.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-foreground-muted">{message.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/articles/new"
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          新しい記事を書く
        </Link>
      </div>
    </div>
  );
}
