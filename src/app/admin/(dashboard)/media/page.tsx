import { prisma } from "@/lib/prisma";
import { buildMediaUsageMap } from "@/lib/mediaUsage";
import { syncMediaFromR2, uploadMedia, type MediaRow } from "./actions";
import { MediaLibraryGrid } from "./MediaLibraryGrid";

export default async function AdminMediaPage({ searchParams }: PageProps<"/admin/media">) {
  const { error, imported } = await searchParams;
  const [media, usageMap] = await Promise.all([
    prisma.media.findMany({ orderBy: { createdAt: "desc" } }),
    buildMediaUsageMap(),
  ]);

  const rows: MediaRow[] = media.map((item) => {
    const usedBy = usageMap.get(item.url) ?? [];
    return {
      id: item.id,
      url: item.url,
      filename: item.filename,
      altText: item.altText,
      mimeType: item.mimeType,
      size: item.size,
      createdAt: item.createdAt.toISOString(),
      isUsed: usedBy.length > 0,
      usedBy,
    };
  });

  return (
    <div>
      <h1 className="font-display text-xl font-black">メディアライブラリ</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        アップロードした画像を管理します。画像をクリックすると詳細・編集ができます。記事編集画面から本文に挿入できます。
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

      <p className="mt-4 flex items-center gap-1.5 text-xs text-foreground-muted">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
        記事で使用されている画像
      </p>

      <div className="mt-2">
        <MediaLibraryGrid media={rows} />
      </div>
    </div>
  );
}
