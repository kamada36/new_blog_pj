import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { deleteArticle } from "./actions";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  published: { label: "公開中", className: "bg-accent-soft text-accent-dark" },
  private: { label: "非公開", className: "bg-red-50 text-red-600" },
  draft: { label: "下書き", className: "bg-surface-muted text-foreground-muted" },
};

export default async function AdminArticlesPage() {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-black">記事一覧</h1>
        <Link
          href="/admin/articles/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          新規作成
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border bg-surface-muted text-left text-xs font-semibold text-foreground-muted">
            <tr>
              <th className="px-4 py-3">タイトル</th>
              <th className="px-4 py-3">カテゴリー</th>
              <th className="px-4 py-3">状態</th>
              <th className="px-4 py-3">閲覧数</th>
              <th className="px-4 py-3">更新日</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} className="border-b border-border last:border-0">
                <td className="max-w-xs truncate px-4 py-3 font-medium">{article.title}</td>
                <td className="px-4 py-3 text-foreground-muted">{article.category.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      (STATUS_BADGES[article.status] ?? STATUS_BADGES.draft).className
                    }`}
                  >
                    {(STATUS_BADGES[article.status] ?? STATUS_BADGES.draft).label}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground-muted">{article.viewCount}</td>
                <td className="px-4 py-3 text-foreground-muted">{formatDate(article.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/admin/articles/${article.id}`} className="text-accent-dark hover:underline">
                      編集
                    </Link>
                    <form action={deleteArticle.bind(null, article.id)}>
                      <ConfirmSubmitButton confirmMessage="この記事を削除します。よろしいですか？" className="text-red-600 hover:underline">
                        削除
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {articles.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-foreground-muted">まだ記事がありません。</p>
        )}
      </div>
    </div>
  );
}
