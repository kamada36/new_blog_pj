"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  countChars,
  isSnsStatus,
  MAIN_MAX_CHARS,
  REPLY_MAX_CHARS,
  SNS_STATUS_LABELS,
  variantLabel,
  type SnsStatus,
} from "@/lib/sns/format";
import { regenerateSnsPostAction, setSnsStatusAction, updateSnsPostAction } from "./actions";

export interface SnsPostRow {
  id: string;
  title: string;
  articleStatus: string;
  url: string;
  variant: number;
  mainText: string;
  replyBody: string;
  status: string;
  scheduledDate: string | null;
  slot: number | null;
  /** メイン・返信の時刻(HH:mm) */
  scheduledTime: string | null;
  replyTime: string | null;
  /** 更新日時。保存・承認のあとに入力欄を最新の値へ作り直すためのキー */
  updatedKey: string;
}

const BUTTON =
  "rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-contrast hover:bg-accent-dark disabled:opacity-50";
const TEXTAREA = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent";

const STATUS_CLASS: Record<SnsStatus, string> = {
  draft: "bg-surface-muted text-foreground-muted",
  approved: "bg-accent-soft text-accent-dark",
  skipped: "bg-red-50 text-red-600",
};

/** 文面の欄の高さ(行数)。空行を含めた行数に合わせ、最低7行・最高16行にする。 */
function textareaRows(text: string): number {
  return Math.min(16, Math.max(7, text.split("\n").length + 1));
}

function Counter({ value, max }: { value: string; max: number }) {
  const count = countChars(value);
  return <span className={count > max ? "font-bold text-red-600" : "text-foreground-muted"}>{count}/{max}字</span>;
}

function PostCard({
  post,
  slotCount,
  selected,
  onToggle,
  onError,
}: {
  post: SnsPostRow;
  /** 時間枠の数(設定で決まる) */
  slotCount: number;
  selected: boolean;
  onToggle: () => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [mainText, setMainText] = useState(post.mainText);
  const [replyBody, setReplyBody] = useState(post.replyBody);
  const [date, setDate] = useState(post.scheduledDate ?? "");
  const [slot, setSlot] = useState(post.slot ? String(post.slot) : "");
  const [time, setTime] = useState(post.scheduledTime ?? "");
  const [replyTime, setReplyTime] = useState(post.replyTime ?? "");
  const [busy, setBusy] = useState(false);

  const status: SnsStatus = isSnsStatus(post.status) ? post.status : "draft";
  const dirty =
    mainText !== post.mainText || replyBody !== post.replyBody || date !== (post.scheduledDate ?? "") || slot !== (post.slot ? String(post.slot) : "") ||
    time !== (post.scheduledTime ?? "") || replyTime !== (post.replyTime ?? "");

  async function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    try {
      const result = await task();
      if (!result.ok) return onError(result.error);
      router.refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() =>
      updateSnsPostAction({
        id: post.id,
        mainText,
        replyBody,
        scheduledDate: date || null,
        slot: slot ? Number(slot) : null,
        scheduledTime: time || null,
        replyTime: replyTime || null,
      })
    );
  const setStatus = (next: SnsStatus) => run(() => setSnsStatusAction({ ids: [post.id], status: next }));

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label="選択" />
        <span className={`rounded-md px-1.5 py-0.5 font-semibold ${STATUS_CLASS[status]}`}>{SNS_STATUS_LABELS[status]}</span>
        <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-foreground-muted">
          {post.variant}. {variantLabel(post.variant)}
        </span>
        {post.articleStatus !== "published" && <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-red-600">記事は非公開(出力されません)</span>}
        <a href={post.url} target="_blank" rel="noreferrer" className="min-w-0 break-words font-semibold text-accent-dark hover:underline">
          {post.title}
        </a>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[3fr_2fr]">
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          <span className="flex justify-between">
            メイン投稿(リンクなし) <Counter value={mainText} max={MAIN_MAX_CHARS} />
          </span>
          <textarea value={mainText} onChange={(e) => setMainText(e.target.value)} rows={textareaRows(mainText)} className={TEXTAREA} />
        </label>
        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="flex justify-between">
              返信(ツリー)の投稿 <Counter value={replyBody} max={REPLY_MAX_CHARS} />
            </span>
            <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={textareaRows(replyBody)} className={TEXTAREA} />
            <span className="break-all text-foreground-muted">末尾に空行をはさんで ＋ {post.url}</span>
          </label>
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label className="flex flex-col gap-1">
              投稿日
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); setReplyTime(""); }} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              時間枠
              <select value={slot} onChange={(e) => { setSlot(e.target.value); setTime(""); setReplyTime(""); }} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm">
                <option value="">未定</option>
                {Array.from({ length: Math.max(slotCount, post.slot ?? 0) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              メインの時刻
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date || !slot} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm disabled:opacity-50" />
            </label>
            <label className="flex flex-col gap-1">
              返信の時刻
              <input type="time" value={replyTime} onChange={(e) => setReplyTime(e.target.value)} disabled={!date || !slot} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm disabled:opacity-50" />
            </label>
            {(date || slot) && (
              <button
                type="button"
                onClick={() => {
                  setDate("");
                  setSlot("");
                  setTime("");
                  setReplyTime("");
                }}
                className="pb-2 text-foreground-muted hover:text-accent-dark hover:underline"
              >
                日付を外す
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy || !dirty} className={dirty ? PRIMARY_BUTTON : BUTTON}>
          {dirty ? "変更を保存" : "保存済み"}
        </button>
        {status !== "approved" && (
          <button type="button" onClick={() => setStatus("approved")} disabled={busy || dirty} className={PRIMARY_BUTTON}>
            承認する
          </button>
        )}
        {status === "approved" && (
          <button type="button" onClick={() => setStatus("draft")} disabled={busy || dirty} className={BUTTON}>
            承認を取り消す
          </button>
        )}
        {status !== "skipped" && (
          <button type="button" onClick={() => setStatus("skipped")} disabled={busy || dirty} className={BUTTON}>
            スキップ
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (window.confirm("この投稿文をAIで作り直します(編集内容は失われ、承認待ちに戻ります)。よろしいですか？")) {
              void run(() => regenerateSnsPostAction(post.id));
            }
          }}
          disabled={busy}
          className={BUTTON}
        >
          AIで作り直す
        </button>
      </div>
    </li>
  );
}

export function PostList({ posts, slotCount }: { posts: SnsPostRow[]; slotCount: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const allSelected = posts.length > 0 && posts.every((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function bulk(status: SnsStatus) {
    setBusy(true);
    setError("");
    try {
      const result = await setSnsStatusAction({ ids: [...selected], status });
      if (!result.ok) return setError(result.error);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  if (posts.length === 0) {
    return <p className="mt-4 rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-foreground-muted">該当する投稿はありません。</p>;
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(posts.map((p) => p.id)))} />
          このページをすべて選択
        </label>
        <span className="text-foreground-muted">{selected.size}件選択中</span>
        <button type="button" onClick={() => bulk("approved")} disabled={busy || selected.size === 0} className={PRIMARY_BUTTON}>
          選択を承認
        </button>
        <button type="button" onClick={() => bulk("skipped")} disabled={busy || selected.size === 0} className={BUTTON}>
          選択をスキップ
        </button>
        <button type="button" onClick={() => bulk("draft")} disabled={busy || selected.size === 0} className={BUTTON}>
          選択を承認待ちに戻す
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {posts.map((post) => (
          // 保存・承認で内容が変わったとき、入力欄の状態を最新の値に作り直す
          <PostCard
            key={`${post.id}:${post.updatedKey}`}
            post={post}
            slotCount={slotCount}
            selected={selected.has(post.id)}
            onToggle={() => toggle(post.id)}
            onError={setError}
          />
        ))}
      </ul>
    </div>
  );
}
