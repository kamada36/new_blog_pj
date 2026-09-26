import { getSiteSetting } from "@/lib/queries";
import { updateSiteSetting, updateSponsorSlots } from "./actions";

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

      <div className="mt-10 max-w-lg rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-bold">スポンサーリンク（アフィリエイト広告）</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          ASP(A8.net、もしもアフィリエイト等)が発行する広告タグ(HTML)をそのまま貼り付けてください。
          規約でサイズや見た目の改変が禁止されている広告が多いため、
          このサイト側では貼り付けたコードに対して一切リサイズ・装飾を行いません。
          <strong className="font-semibold text-foreground">
            下記に記載の目安サイズに収まる広告タグを選んで貼り付けてください。
          </strong>
        </p>

        <form action={updateSponsorSlots} className="mt-4 flex flex-col gap-5">
          <div>
            <label className="text-sm font-semibold">ウィジェット枠（サイドバー中段）</label>
            <p className="mt-0.5 text-xs text-foreground-muted">
              設置可能サイズの目安: 正方形〜縦長長方形（250×250 / 300×250 / 300×300 /
              240×400 など、横幅300px程度まで）
            </p>
            <textarea
              name="sponsorSidebarEmbed"
              defaultValue={setting.sponsorSidebarEmbed}
              rows={5}
              placeholder="<a href=... ><img src=... /></a> のような広告タグをそのまま貼り付け"
              className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">フッター上部（全ページ共通）</label>
            <p className="mt-0.5 text-xs text-foreground-muted">
              設置可能サイズの目安: 横長バナー（728×90 / 468×60 / 320×50
              など、横幅728px程度まで）
            </p>
            <textarea
              name="sponsorFooterEmbed"
              defaultValue={setting.sponsorFooterEmbed}
              rows={5}
              placeholder="<a href=... ><img src=... /></a> のような広告タグをそのまま貼り付け"
              className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
          </div>

          <button
            type="submit"
            className="self-start rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
          >
            広告タグを保存する
          </button>
        </form>
      </div>
    </div>
  );
}
