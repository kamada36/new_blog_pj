import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { createShortcode, deleteShortcode, updateShortcode } from "./actions";

export default async function AdminShortcodesPage({ searchParams }: PageProps<"/admin/shortcodes">) {
  const { error } = await searchParams;
  const shortcodes = await prisma.shortcode.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div>
      <h1 className="font-display text-xl font-black">ショートコード</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        記事本文中に <code className="rounded bg-surface-muted px-1.5 py-0.5">{'[sc name="名前"]コメント[/sc]'}</code>{" "}
        と書くと、キャラクターの吹き出しコメントとして表示されます。コメント部分を省略した場合はデフォルトコメントが使われます。
      </p>
      {typeof error === "string" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {shortcodes.map((shortcode) => (
          <form
            key={shortcode.id}
            action={updateShortcode.bind(null, shortcode.id)}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <Image
              src={shortcode.iconUrl}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
            />
            <input
              name="name"
              defaultValue={shortcode.name}
              required
              placeholder="ショートコード名"
              className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <select
              name="position"
              defaultValue={shortcode.position}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="l">左</option>
              <option value="r">右</option>
            </select>
            <input
              name="defaultTalk"
              defaultValue={shortcode.defaultTalk}
              placeholder="デフォルトコメント"
              className="min-w-[160px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              type="file"
              name="icon"
              accept="image/*"
              className="w-52 text-xs outline-none file:mr-2 file:rounded-full file:border-0 file:bg-accent-soft file:px-2 file:py-1 file:text-xs"
            />
            <div className="flex gap-3">
              <button type="submit" className="text-sm font-semibold text-accent-dark hover:underline">
                保存
              </button>
              <ConfirmSubmitButton
                formAction={deleteShortcode.bind(null, shortcode.id)}
                confirmMessage="このショートコードを削除しますか？本文中で使用している箇所は表示できなくなります。"
                className="text-sm font-semibold text-red-600 hover:underline"
              >
                削除
              </ConfirmSubmitButton>
            </div>
          </form>
        ))}
        {shortcodes.length === 0 && (
          <p className="text-sm text-foreground-muted">まだショートコードが登録されていません。</p>
        )}
      </div>

      <form
        action={createShortcode}
        className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border p-4"
      >
        <input
          name="name"
          required
          placeholder="ショートコード名(例: hukidasi3)"
          className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <select
          name="position"
          defaultValue="l"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="l">左</option>
          <option value="r">右</option>
        </select>
        <input
          name="defaultTalk"
          placeholder="デフォルトコメント"
          className="min-w-[160px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <input
          type="file"
          name="icon"
          accept="image/*"
          required
          className="w-52 text-xs outline-none file:mr-2 file:rounded-full file:border-0 file:bg-accent-soft file:px-2 file:py-1 file:text-xs"
        />
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          追加
        </button>
      </form>
    </div>
  );
}
