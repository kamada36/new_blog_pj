"use client";

import { useActionState, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { savePage, type PageFormState } from "./actions";
import { slugify } from "@/lib/slug";

const initialState: PageFormState = { status: "idle" };

export type PageInitialValues = {
  id?: string;
  title: string;
  slug: string;
  contentMarkdown: string;
  metaTitle: string;
  metaDescription: string;
};

const emptyValues: PageInitialValues = {
  title: "",
  slug: "",
  contentMarkdown: "",
  metaTitle: "",
  metaDescription: "",
};

export function PageEditorForm({ initialValues }: { initialValues?: PageInitialValues }) {
  const values = initialValues ?? emptyValues;
  const [state, formAction, pending] = useActionState(savePage, initialState);
  const [title, setTitle] = useState(values.title);
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(values.slug));
  const [content, setContent] = useState(values.contentMarkdown);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="contentMarkdown" value={content} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold">タイトル</label>
          <input
            name="title"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-sm font-semibold">スラッグ（URL: /スラッグ）</label>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold">本文（Markdown）</label>
        <div className="mt-1 overflow-hidden rounded-lg border border-border">
          <CodeMirror value={content} height="420px" extensions={[markdown()]} onChange={(value) => setContent(value)} />
        </div>
      </div>

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-bold">SEOメタ情報</legend>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-foreground-muted">メタタイトル</label>
            <input
              name="metaTitle"
              defaultValue={values.metaTitle}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground-muted">メタディスクリプション</label>
            <textarea
              name="metaDescription"
              rows={2}
              defaultValue={values.metaDescription}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
      </fieldset>

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}
