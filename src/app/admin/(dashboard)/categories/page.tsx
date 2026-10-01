import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { ImagePickerField } from "@/components/admin/ImagePickerField";
import { createCategory, deleteCategory, updateCategory } from "./actions";

const ICON_PREVIEW_CLASS = "h-10 w-10 rounded-full border border-border object-cover";

function iconPreview(url: string) {
  return <Image src={url} alt="" width={40} height={40} className={ICON_PREVIEW_CLASS} unoptimized />;
}

export default async function AdminCategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  const { error } = await searchParams;
  const categories = await prisma.category.findMany({ orderBy: { order: "asc" } });

  return (
    <div>
      <h1 className="font-display text-xl font-black">カテゴリー</h1>
      {typeof error === "string" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {categories.map((category) => (
          <form
            key={category.id}
            action={updateCategory.bind(null, category.id)}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr_80px_auto] sm:items-center">
              <input
                name="name"
                defaultValue={category.name}
                required
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                placeholder="名前"
              />
              <input
                name="slug"
                defaultValue={category.slug}
                required
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                placeholder="スラッグ"
              />
              <input
                name="description"
                defaultValue={category.description}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                placeholder="説明"
              />
              <input
                name="order"
                type="number"
                defaultValue={category.order}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                placeholder="表示順"
              />
              <div className="flex gap-3 justify-self-end">
                <button type="submit" className="text-sm font-semibold text-accent-dark hover:underline">
                  保存
                </button>
                <ConfirmSubmitButton
                  formAction={deleteCategory.bind(null, category.id)}
                  confirmMessage="このカテゴリーを削除しますか？"
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  削除
                </ConfirmSubmitButton>
              </div>
            </div>
            <ImagePickerField
              name="icon"
              buttonLabel="アイコンをライブラリから選択"
              previewClassName={ICON_PREVIEW_CLASS}
              fallback={
                category.iconUrl ? (
                  iconPreview(category.iconUrl)
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[9px] text-foreground-muted">
                    未設定
                  </div>
                )
              }
            />
          </form>
        ))}
      </div>

      <form
        action={createCategory}
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr_80px_auto] sm:items-center">
          <input name="name" required placeholder="新しいカテゴリー名" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <input name="slug" placeholder="スラッグ（未入力なら自動生成）" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <input name="description" placeholder="説明" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <input name="order" type="number" defaultValue={0} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <button type="submit" className="justify-self-end rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark">
            追加
          </button>
        </div>
        <ImagePickerField
          name="icon"
          buttonLabel="アイコンをライブラリから選択"
          previewClassName={ICON_PREVIEW_CLASS}
          fallback={
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[9px] text-foreground-muted">
              未選択
            </div>
          }
        />
      </form>
    </div>
  );
}
