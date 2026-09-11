import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { createTag, deleteTag, updateTag } from "./actions";

export default async function AdminTagsPage({ searchParams }: PageProps<"/admin/tags">) {
  const { error } = await searchParams;
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="font-display text-xl font-black">タグ</h1>
      {typeof error === "string" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {tags.map((tag) => (
          <form
            key={tag.id}
            action={updateTag.bind(null, tag.id)}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
          >
            <input name="name" defaultValue={tag.name} required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input name="slug" defaultValue={tag.slug} required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <div className="flex gap-3 justify-self-end">
              <button type="submit" className="text-sm font-semibold text-accent-dark hover:underline">
                保存
              </button>
              <ConfirmSubmitButton
                formAction={deleteTag.bind(null, tag.id)}
                confirmMessage="このタグを削除しますか？"
                className="text-sm font-semibold text-red-600 hover:underline"
              >
                削除
              </ConfirmSubmitButton>
            </div>
          </form>
        ))}
      </div>

      <form
        action={createTag}
        className="mt-8 grid grid-cols-1 gap-3 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
      >
        <input name="name" required placeholder="新しいタグ名" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <input name="slug" placeholder="スラッグ（未入力なら自動生成）" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <button type="submit" className="justify-self-end rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark">
          追加
        </button>
      </form>
    </div>
  );
}
