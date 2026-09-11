"use client";

import { useActionState } from "react";
import { submitContact, type ContactFormState } from "./actions";

const initialState: ContactFormState = { status: "idle" };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContact, initialState);

  if (state.status === "success") {
    return (
      <div className="rounded-2xl border border-border bg-surface-muted p-6 text-sm">
        {state.message}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-sm font-semibold">
          お名前
        </label>
        <input
          id="name"
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="email" className="text-sm font-semibold">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="message" className="text-sm font-semibold">
          お問い合わせ内容
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "送信中..." : "送信する"}
      </button>
    </form>
  );
}
