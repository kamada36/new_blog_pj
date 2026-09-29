"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { saveArticle, type ArticleFormState } from "./actions";
import { slugify } from "@/lib/slug";
import { TagAutocompleteInput } from "@/components/admin/TagAutocompleteInput";

const initialState: ArticleFormState = { status: "idle" };

type Category = { id: string; name: string };
type Tag = { id: string; name: string };

export type ArticleInitialValues = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  categoryId: string;
  tagIds: string[];
  status: "draft" | "published" | "private";
  coverImageUrl: string | null;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
};

const emptyValues: ArticleInitialValues = {
  title: "",
  slug: "",
  excerpt: "",
  contentMarkdown: "",
  categoryId: "",
  tagIds: [],
  status: "draft",
  coverImageUrl: null,
  metaTitle: "",
  metaDescription: "",
  metaKeywords: "",
};

export function ArticleEditorForm({
  categories,
  tags,
  initialValues,
}: {
  categories: Category[];
  tags: Tag[];
  initialValues?: ArticleInitialValues;
}) {
  const values = initialValues ?? emptyValues;
  const [state, formAction, pending] = useActionState(saveArticle, initialState);
  const [title, setTitle] = useState(values.title);
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(values.slug));
  const [content, setContent] = useState(values.contentMarkdown);
  const [coverPreview, setCoverPreview] = useState<string | null>(values.coverImageUrl);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="contentMarkdown" value={content} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
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
          <label className="text-sm font-semibold">スラッグ（URL）</label>
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

        <div>
          <label className="text-sm font-semibold">カテゴリー</label>
          <select
            name="categoryId"
            required
            defaultValue={values.categoryId}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="" disabled>
              選択してください
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="text-sm font-semibold">抜粋（一覧・OGP用の説明文）</label>
          <textarea
            name="excerpt"
            rows={2}
            defaultValue={values.excerpt}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="text-sm font-semibold">公開ステータス</label>
          <select
            name="status"
            defaultValue={values.status}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="published">公開</option>
            <option value="draft">下書き</option>
            <option value="private">非公開</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-semibold">アイキャッチ画像</label>
          <input
            type="file"
            name="coverImage"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setCoverPreview(URL.createObjectURL(file));
            }}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:text-xs"
          />
          {coverPreview && (
            <div className="relative mt-2 aspect-[16/9] w-full max-w-xs overflow-hidden rounded-lg bg-surface-muted">
              <Image src={coverPreview} alt="" fill className="object-cover" unoptimized />
            </div>
          )}
        </div>
      </div>

      {tags.length > 0 && <TagAutocompleteInput tags={tags} defaultSelectedIds={values.tagIds} />}

      <div>
        <label className="text-sm font-semibold">本文（Markdown）</label>
        <div className="mt-1 overflow-hidden rounded-lg border border-border">
          <CodeMirror
            value={content}
            height="480px"
            extensions={[markdown()]}
            onChange={(value) => setContent(value)}
          />
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
              placeholder="未入力の場合は記事タイトルを使用します"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground-muted">メタディスクリプション</label>
            <textarea
              name="metaDescription"
              rows={2}
              defaultValue={values.metaDescription}
              placeholder="未入力の場合は抜粋を使用します"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground-muted">メタキーワード（カンマ区切り）</label>
            <input
              name="metaKeywords"
              defaultValue={values.metaKeywords}
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
