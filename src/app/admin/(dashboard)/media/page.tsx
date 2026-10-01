import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { deleteMedia, syncMediaFromR2, updateMedia, uploadMedia } from "./actions";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default async function AdminMediaPage({ searchParams }: PageProps<"/admin/media">) {
  const { error, imported } = await searchParams;
  const media = await prisma.media.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="font-display text-xl font-black">メディアライブラリ</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        アップロードした画像を管理します。ファイル名やalt属性を設定でき、記事編集画面から本文に挿入できます。
      </p>
      {typeof error === "string" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      {typeof imported === "string" && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-dark">
          {imported === "0" ? "新しく取り込む画像はありませんでした。" : `${imported}件の画像を取り込みました。`}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <form
          action={uploadMedia}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border p-4"
        >
          <input
            type="file"
            name="files"
            accept="image/*"
            multiple
            required
            className="min-w-[220px] flex-1 text-xs outline-none file:mr-2 file:rounded-full file:border-0 file:bg-accent-soft file:px-2 file:py-1 file:text-xs"
          />
          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
          >
            アップロード
          </button>
        </form>

        <form
          action={syncMediaFromR2}
          className="flex flex-col justify-center gap-1 rounded-2xl border border-dashed border-border p-4"
        >
          <button
            type="submit"
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent-dark"
          >
            R2から既存画像を取り込む
          </button>
          <p className="text-[11px] text-foreground-muted">
            WordPress移行時にR2へ直接保存された画像をこのライブラリに登録します。
          </p>
        </form>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {media.map((item) => (
          <form
            key={item.id}
            action={updateMedia.bind(null, item.id)}
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-1.5"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-muted">
              <Image src={item.url} alt={item.altText} fill sizes="120px" className="object-cover" unoptimized />
            </div>
            <input
              name="filename"
              defaultValue={item.filename}
              required
              placeholder="ファイル名"
              className="w-full rounded-md border border-border bg-surface px-1.5 py-1 text-[11px] outline-none focus:border-accent"
            />
            <input
              name="altText"
              defaultValue={item.altText}
              placeholder="alt属性"
              className="w-full rounded-md border border-border bg-surface px-1.5 py-1 text-[11px] outline-none focus:border-accent"
            />
            <p className="text-[10px] text-foreground-muted">{formatBytes(item.size)}</p>
            <div className="flex items-center justify-between gap-2">
              <button type="submit" className="text-[11px] font-semibold text-accent-dark hover:underline">
                保存
              </button>
              <ConfirmSubmitButton
                formAction={deleteMedia.bind(null, item.id)}
                confirmMessage="この画像を削除します。記事本文で使用している場合、表示できなくなります。よろしいですか？"
                className="text-[11px] font-semibold text-red-600 hover:underline"
              >
                削除
              </ConfirmSubmitButton>
            </div>
          </form>
        ))}
        {media.length === 0 && (
          <p className="col-span-full text-sm text-foreground-muted">まだメディアがアップロードされていません。</p>
        )}
      </div>
    </div>
  );
}
