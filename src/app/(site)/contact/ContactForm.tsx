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
    <form
      name="contact"
      data-netlify="true"
      netlify-honeypot="bot-field"
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="form-name" value="contact" />
      {/* ハニーポット: 人間には見えない罠。ボットが埋めると submitContact 側で破棄する。 */}
      <div hidden aria-hidden="true" style={{ display: "none" }}>
        <label>
          入力しないでください
          <input name="bot-field" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
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
