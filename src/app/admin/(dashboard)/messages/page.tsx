import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { deleteMessage, markMessageRead } from "./actions";

export default async function AdminMessagesPage() {
  const messages = await prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="font-display text-xl font-black">お問い合わせ</h1>

      <div className="mt-6 flex flex-col gap-3">
        {messages.map((message) => (
          <div key={message.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{message.name}</p>
                <span className="text-xs text-foreground-muted">&lt;{message.email}&gt;</span>
                {!message.readAt && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-dark">未読</span>
                )}
              </div>
              <span className="text-xs text-foreground-muted">{formatDate(message.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">{message.message}</p>
            <div className="mt-3 flex gap-4">
              {!message.readAt && (
                <form action={markMessageRead.bind(null, message.id)}>
                  <button type="submit" className="text-sm font-semibold text-accent-dark hover:underline">
                    既読にする
                  </button>
                </form>
              )}
              <form action={deleteMessage.bind(null, message.id)}>
                <ConfirmSubmitButton confirmMessage="このお問い合わせを削除しますか？" className="text-sm font-semibold text-red-600 hover:underline">
                  削除
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-sm text-foreground-muted">お問い合わせはまだありません。</p>}
      </div>
    </div>
  );
}
