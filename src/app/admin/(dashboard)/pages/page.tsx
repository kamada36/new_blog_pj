import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { deletePage } from "./actions";

export default async function AdminPagesPage() {
  const pages = await prisma.page.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-black">固定ページ</h1>
        <Link
          href="/admin/pages/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          新規作成
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {pages.map((page) => (
          <div
            key={page.id}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold">{page.title}</p>
              <p className="text-xs text-foreground-muted">/{page.slug}</p>
            </div>
            <div className="flex gap-4">
              <Link href={`/admin/pages/${page.id}`} className="text-sm font-semibold text-accent-dark hover:underline">
                編集
              </Link>
              <form action={deletePage.bind(null, page.id)}>
                <ConfirmSubmitButton confirmMessage="このページを削除しますか？" className="text-sm font-semibold text-red-600 hover:underline">
                  削除
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>
        ))}
        {pages.length === 0 && <p className="text-sm text-foreground-muted">固定ページがまだありません。</p>}
      </div>
    </div>
  );
}
