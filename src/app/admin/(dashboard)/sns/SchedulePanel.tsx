"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearSnsScheduleAction, scheduleSnsAction } from "./actions";

const BUTTON =
  "rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-50";
const INPUT = "w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";

/** 承認済みの投稿に投稿日と時間枠を割り当てる操作と、ツールへ渡すCSVの出力。 */
export function SchedulePanel({ approvedUnscheduled, today, defaultTo }: { approvedUnscheduled: number; today: string; defaultTo: string }) {
  const router = useRouter();
  const [postsPerDay, setPostsPerDay] = useState(3);
  const [slotCount, setSlotCount] = useState(3);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "notice" | "error"; text: string } | null>(null);

  async function schedule() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await scheduleSnsAction({ postsPerDay, slotCount, days });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setMessage({
        kind: "notice",
        text:
          `${result.scheduled}件に日付と時間枠を割り当てました。` +
          (result.unscheduled > 0 ? `${result.unscheduled}件は、期間内に空きが無い(または同じ記事の間隔を空ける)ため未割り当てです。期間を広げると割り当てられます。` : ""),
      });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "割り当てに失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("明日以降に割り当てた日付と時間枠をすべて解除します(承認は残ります)。よろしいですか？")) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await clearSnsScheduleAction();
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setMessage({ kind: "notice", text: `${result.count}件の割り当てを解除しました。` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-bold">2. 投稿日と時間枠を割り当てる</h2>
      <p className="mt-1 text-xs text-foreground-muted">
        承認済みで日付の未定の投稿(現在 <strong className="text-foreground">{approvedUnscheduled}件</strong>)に、明日以降の日付と時間枠を割り当てます。新しい記事を先に、その後は全記事を1巡してから2巡目の切り口へ進み、同じ記事は3日以上空けます。
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4 text-xs">
        <label className="flex flex-col gap-1">
          1日の投稿数
          <input type="number" min={1} max={10} value={postsPerDay} onChange={(e) => setPostsPerDay(Number(e.target.value) || 1)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          時間枠の数
          <input type="number" min={1} max={5} value={slotCount} onChange={(e) => setSlotCount(Number(e.target.value) || 1)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          割り当てる日数
          <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} className={INPUT} />
        </label>
        <button type="button" onClick={schedule} disabled={busy || approvedUnscheduled === 0} className={PRIMARY_BUTTON}>
          自動で割り当てる
        </button>
        <button type="button" onClick={clearAll} disabled={busy} className={BUTTON}>
          明日以降の割り当てを解除
        </button>
      </div>
      {message && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${message.kind === "error" ? "bg-red-50 text-red-600" : "bg-accent-soft text-accent-dark"}`}>
          {message.text}
        </p>
      )}

      <h2 className="mt-6 text-sm font-bold">3. CSVを出力する</h2>
      <p className="mt-1 text-xs text-foreground-muted">
        承認済みで日付と時間枠が決まっている投稿を、スプレッドシートの一括読み込み用CSV(投稿日, 投稿時間枠, 投稿内容)にします。改行は「\n」の文字で表します。
        返信(ツリー)の分は、メイン投稿と同じ日付・枠で、記事の紹介文の末尾にURLを付けた文面を出力します(空行も「\n\n」で再現します)。
      </p>
      <form action="/admin/api/sns/export/" method="get" className="mt-3 flex flex-wrap items-end gap-4 text-xs">
        <label className="flex flex-col gap-1">
          開始日
          <input type="date" name="from" defaultValue={today} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          終了日
          <input type="date" name="to" defaultValue={defaultTo} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          種類
          <select name="part" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="main">メイン投稿(リンクなし)</option>
            <option value="reply">ツリーの返信(リンク付き)</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-2">
          <input type="checkbox" name="header" value="0" /> 見出し行を付けない
        </label>
        <button type="submit" className={PRIMARY_BUTTON}>
          CSVをダウンロード
        </button>
      </form>
    </section>
  );
}
