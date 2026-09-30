"use client";

import { useActionState, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { saveArticle, type ArticleFormState } from "./actions";
import { slugify } from "@/lib/slug";
import { TagAutocompleteInput } from "@/components/admin/TagAutocompleteInput";
import { ArticleBody } from "@/components/article/ArticleBody";

const PREVIEW_STORAGE_KEY = "articlePreviewData";

function subscribeDarkModeChange(callback: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getDarkModeSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function getDarkModeServerSnapshot() {
  return false;
}

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
  const [categoryId, setCategoryId] = useState(values.categoryId);
  const [content, setContent] = useState(values.contentMarkdown);
  const [coverPreview, setCoverPreview] = useState<string | null>(values.coverImageUrl);
  const [metaTitleLength, setMetaTitleLength] = useState(values.metaTitle.length);
  const [metaDescriptionLength, setMetaDescriptionLength] = useState(values.metaDescription.length);
  const [metaKeywordsLength, setMetaKeywordsLength] = useState(values.metaKeywords.length);
  const [splitPreview, setSplitPreview] = useState(false);
  const isDark = useSyncExternalStore(subscribeDarkModeChange, getDarkModeSnapshot, getDarkModeServerSnapshot);

  const editorScrollElRef = useRef<HTMLElement | null>(null);
  const previewScrollElRef = useRef<HTMLDivElement | null>(null);
  // "editor"/"preview": プログラム側でスクロール位置を設定した直後であることを示すフラグ。
  // 相手側のscrollイベントを1回だけ無視して、お互いを無限に呼び合うのを防ぐ。
  const syncSourceRef = useRef<"editor" | "preview" | null>(null);

  function syncScrollRatio(from: HTMLElement, to: HTMLElement, source: "editor" | "preview") {
    const fromRange = from.scrollHeight - from.clientHeight;
    const ratio = fromRange > 0 ? from.scrollTop / fromRange : 0;
    const toRange = to.scrollHeight - to.clientHeight;
    syncSourceRef.current = source;
    to.scrollTop = ratio * toRange;
  }

  function handleEditorScroll() {
    if (syncSourceRef.current === "preview") {
      syncSourceRef.current = null;
      return;
    }
    const editorEl = editorScrollElRef.current;
    const previewEl = previewScrollElRef.current;
    if (!editorEl || !previewEl) return;
    syncScrollRatio(editorEl, previewEl, "editor");
  }

  function handlePreviewScroll() {
    if (syncSourceRef.current === "editor") {
      syncSourceRef.current = null;
      return;
    }
    const editorEl = editorScrollElRef.current;
    const previewEl = previewScrollElRef.current;
    if (!editorEl || !previewEl) return;
    syncScrollRatio(previewEl, editorEl, "preview");
  }

  function openPreviewInNewTab() {
    const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "";
    try {
      localStorage.setItem(
        PREVIEW_STORAGE_KEY,
        JSON.stringify({ title, contentMarkdown: content, coverImageUrl: coverPreview, categoryName })
      );
    } catch {
      // localStorageが使えない環境ではプレビューを諦める
    }
    window.open("/admin/preview", "_blank");
  }

  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-6">
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
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
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

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-semibold">本文（Markdown）</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-muted">{content.length}文字</span>
            <button
              type="button"
              onClick={() => setSplitPreview((prev) => !prev)}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:border-accent hover:text-accent-dark"
            >
              {splitPreview ? "分割プレビューを閉じる" : "分割プレビュー"}
            </button>
            <button
              type="button"
              onClick={openPreviewInNewTab}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:border-accent hover:text-accent-dark"
            >
              新しいタブでプレビュー
            </button>
          </div>
        </div>
        <div className={`mt-1 grid min-w-0 gap-4 ${splitPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          <div className="min-w-0 overflow-hidden rounded-lg border border-border">
            <CodeMirror
              value={content}
              height="480px"
              theme={isDark ? "dark" : "light"}
              extensions={[markdown(), EditorView.lineWrapping]}
              onChange={(value) => setContent(value)}
              onCreateEditor={(view) => {
                editorScrollElRef.current = view.scrollDOM;
                view.scrollDOM.addEventListener("scroll", handleEditorScroll);
              }}
            />
          </div>
          {splitPreview && (
            <div
              ref={previewScrollElRef}
              onScroll={handlePreviewScroll}
              className="min-w-0 overflow-y-auto rounded-lg border border-border bg-surface p-4"
              style={{ height: 480 }}
            >
              <ArticleBody markdown={content || "(本文未入力)"} />
            </div>
          )}
        </div>
      </div>

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-bold">SEOメタ情報</legend>
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold text-foreground-muted">メタタイトル</label>
              <span className="text-xs text-foreground-muted">{metaTitleLength}文字</span>
            </div>
            <input
              name="metaTitle"
              defaultValue={values.metaTitle}
              onChange={(e) => setMetaTitleLength(e.target.value.length)}
              placeholder="未入力の場合は記事タイトルを使用します"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold text-foreground-muted">メタディスクリプション</label>
              <span className="text-xs text-foreground-muted">{metaDescriptionLength}文字</span>
            </div>
            <textarea
              name="metaDescription"
              rows={2}
              defaultValue={values.metaDescription}
              onChange={(e) => setMetaDescriptionLength(e.target.value.length)}
              placeholder="未入力の場合は抜粋を使用します"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold text-foreground-muted">メタキーワード（カンマ区切り）</label>
              <span className="text-xs text-foreground-muted">{metaKeywordsLength}文字</span>
            </div>
            <input
              name="metaKeywords"
              defaultValue={values.metaKeywords}
              onChange={(e) => setMetaKeywordsLength(e.target.value.length)}
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
