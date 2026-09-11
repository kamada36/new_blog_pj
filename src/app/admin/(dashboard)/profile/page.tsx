import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { IconMug } from "@/components/icons/CafeIcons";
import { changePassword, updateProfile } from "./actions";

export default async function AdminProfilePage({ searchParams }: PageProps<"/admin/profile">) {
  const { status, message } = await searchParams;
  const user = await getSessionUser();
  if (!user) return null;

  return (
    <div>
      <h1 className="font-display text-xl font-black">プロフィール設定</h1>

      {typeof message === "string" && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            status === "success" ? "bg-accent-soft text-accent-dark" : "bg-red-50 text-red-600"
          }`}
        >
          {message}
        </p>
      )}

      <form action={updateProfile} className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-bold">基本情報</h2>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.name} width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
              <IconMug className="h-7 w-7 text-accent-dark" />
            </div>
          )}
          <div className="flex-1">
            <label className="text-xs font-semibold text-foreground-muted">プロフィール画像</label>
            <input
              type="file"
              name="avatar"
              accept="image/*"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:text-xs"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold">名前</label>
          <input
            name="name"
            defaultValue={user.name}
            required
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-sm font-semibold">自己紹介（Markdown）</label>
          <textarea
            name="bio"
            rows={6}
            defaultValue={user.bio}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">X (Twitter) URL</label>
            <input
              name="snsX"
              defaultValue={user.snsX ?? ""}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-sm font-semibold">Threads URL</label>
            <input
              name="snsThreads"
              defaultValue={user.snsThreads ?? ""}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
        <button
          type="submit"
          className="self-start rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          保存する
        </button>
      </form>

      <form action={changePassword} className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-bold">パスワード変更</h2>
        <div>
          <label className="text-sm font-semibold">現在のパスワード</label>
          <input
            type="password"
            name="currentPassword"
            required
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">新しいパスワード</label>
            <input
              type="password"
              name="newPassword"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-sm font-semibold">新しいパスワード（確認）</label>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
        <button
          type="submit"
          className="self-start rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          パスワードを変更する
        </button>
      </form>
    </div>
  );
}
