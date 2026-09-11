import { getSiteSetting } from "@/lib/queries";
import { updateSiteSetting } from "./actions";

export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const { status, error } = await searchParams;
  const setting = await getSiteSetting();

  return (
    <div>
      <h1 className="font-display text-xl font-black">サイト設定</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        サイト名やキャッチコピーなど、基本的な表示情報のみ変更できます。レイアウトの調整はコード側で行います。
      </p>

      {status === "success" && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-dark">設定を保存しました。</p>
      )}
      {typeof error === "string" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <form action={updateSiteSetting} className="mt-6 flex max-w-lg flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <div>
          <label className="text-sm font-semibold">サイト名</label>
          <input
            name="siteName"
            defaultValue={setting.siteName}
            required
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-sm font-semibold">キャッチコピー</label>
          <input
            name="tagline"
            defaultValue={setting.tagline}
            required
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-sm font-semibold">フッター著作権表記</label>
          <input
            name="footerCopyright"
            defaultValue={setting.footerCopyright}
            required
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          className="self-start rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          保存する
        </button>
      </form>
    </div>
  );
}
