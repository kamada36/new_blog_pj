"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_TIME_FRAMES, type TimeFrame } from "@/lib/sns/format";
import { clearSnsScheduleAction, saveSnsSettingsAction, scheduleSnsAction } from "./actions";

const BUTTON =
  "rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-50";
const INPUT = "w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";
const TIME_INPUT = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";

type Message = { kind: "notice" | "error"; text: string } | null;

function MessageBox({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${message.kind === "error" ? "bg-red-50 text-red-600" : "bg-accent-soft text-accent-dark"}`}>
      {message.text}
    </p>
  );
}

/** 投稿の時間枠(開始・終了時刻)と、メインから返信までの間隔。投稿時刻はこの範囲内でランダムに決める。 */
function SettingsPanel({ frames: initialFrames, replyDelayMin: initialMin, replyDelayMax: initialMax }: { frames: TimeFrame[]; replyDelayMin: number; replyDelayMax: number }) {
  const router = useRouter();
  const [frames, setFrames] = useState<TimeFrame[]>(initialFrames);
  const [delayMin, setDelayMin] = useState(initialMin);
  const [delayMax, setDelayMax] = useState(initialMax);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  function updateFrame(index: number, patch: Partial<TimeFrame>) {
    setFrames((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveSnsSettingsAction({ frames, replyDelayMin: delayMin, replyDelayMax: delayMax });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setMessage({ kind: "notice", text: "設定を保存しました。割り当て済みの予定は変わりません(変えたいときは、割り当てを解除してもう一度割り当ててください)。" });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "保存に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-sm font-bold">時間枠の設定</h2>
      <p className="mt-1 text-xs text-foreground-muted">
        投稿時刻は、割り当てるときに、この範囲内でランダムに決めます(毎日同じ時刻にしないため)。返信(ツリー)は、メインの数分後になります。
      </p>
      <div className="mt-3 flex flex-col gap-2 text-xs">
        {frames.map((frame, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <span className="w-14 font-semibold">時間枠{index + 1}</span>
            <input type="time" value={frame.start} onChange={(e) => updateFrame(index, { start: e.target.value })} className={TIME_INPUT} aria-label={`時間枠${index + 1}の開始`} />
            〜
            <input type="time" value={frame.end} onChange={(e) => updateFrame(index, { end: e.target.value })} className={TIME_INPUT} aria-label={`時間枠${index + 1}の終了`} />
            {frames.length > 1 && index === frames.length - 1 && (
              <button type="button" onClick={() => setFrames((prev) => prev.slice(0, -1))} className="text-foreground-muted hover:text-accent-dark hover:underline">
                削除
              </button>
            )}
          </div>
        ))}
        {frames.length < MAX_TIME_FRAMES && (
          <button type="button" onClick={() => setFrames((prev) => [...prev, { start: "18:00", end: "19:00" }])} className="w-fit text-accent-dark hover:underline">
            ＋ 時間枠を追加
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4 text-xs">
        <label className="flex flex-col gap-1">
          返信までの間隔(最小・分)
          <input type="number" min={1} max={60} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value) || 1)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          返信までの間隔(最大・分)
          <input type="number" min={1} max={60} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value) || 1)} className={INPUT} />
        </label>
        <button type="button" onClick={save} disabled={busy} className={BUTTON}>
          設定を保存
        </button>
      </div>
      <MessageBox message={message} />
    </div>
  );
}

/** 承認済みの投稿に投稿日・時間枠・時刻を割り当てる操作と、ツールへ渡すCSVの出力。 */
export function SchedulePanel({
  approvedUnscheduled,
  today,
  defaultTo,
  frames,
  replyDelayMin,
  replyDelayMax,
}: {
  approvedUnscheduled: number;
  today: string;
  defaultTo: string;
  frames: TimeFrame[];
  replyDelayMin: number;
  replyDelayMax: number;
}) {
  const router = useRouter();
  const [postsPerDay, setPostsPerDay] = useState(3);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function schedule() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await scheduleSnsAction({ postsPerDay, days });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setMessage({
        kind: "notice",
        text:
          `${result.scheduled}件に日付・時間枠・時刻を割り当てました。` +
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
    if (!window.confirm("明日以降に割り当てた日付・時間枠・時刻をすべて解除します(承認は残ります)。よろしいですか？")) return;
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
      <h2 className="text-sm font-bold">2. 投稿日と時刻を割り当てる</h2>
      <SettingsPanel frames={frames} replyDelayMin={replyDelayMin} replyDelayMax={replyDelayMax} />

      <h3 className="mt-6 text-sm font-bold">自動で割り当てる</h3>
      <p className="mt-1 text-xs text-foreground-muted">
        承認済みで日付の未定の投稿(現在 <strong className="text-foreground">{approvedUnscheduled}件</strong>)に、明日以降の日付・時間枠・時刻を割り当てます。新しい記事を先に、その後は全記事を1巡してから2巡目の切り口へ進み、同じ記事は3日以上空けます。1日の投稿が時間枠({frames.length}つ)より多いときは、同じ枠に複数入ります。
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4 text-xs">
        <label className="flex flex-col gap-1">
          1日の投稿数
          <input type="number" min={1} max={10} value={postsPerDay} onChange={(e) => setPostsPerDay(Number(e.target.value) || 1)} className={INPUT} />
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
      <MessageBox message={message} />

      <h2 className="mt-6 text-sm font-bold">3. CSVを出力する</h2>
      <p className="mt-1 text-xs text-foreground-muted">
        承認済みで日付・時間枠・時刻が決まっている投稿を、スプレッドシートの一括読み込み用CSVにします。列は「投稿日, 投稿時間枠, 投稿内容, to_X, to_Thr, 予定投稿時間, ツリー, サイトID」で、メイン投稿の直後に、その返信(ツリー=1。記事の紹介とURL付き)の行が続きます。改行・空行は「\n」の文字で表します。サイトIDは、スプレッドシート側が登録済みの投稿を飛ばして、二重登録を防ぐために使います。
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
            <option value="tree">メイン+返信(ツリー)</option>
            <option value="main">メイン投稿だけ</option>
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
