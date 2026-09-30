"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { ArticleBody } from "@/components/article/ArticleBody";
import { IconMug } from "@/components/icons/CafeIcons";

const PREVIEW_STORAGE_KEY = "articlePreviewData";

type PreviewData = {
  title: string;
  contentMarkdown: string;
  coverImageUrl: string | null;
  categoryName: string;
};

function subscribeStorageChange(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getStorageSnapshot() {
  return localStorage.getItem(PREVIEW_STORAGE_KEY);
}
function getStorageServerSnapshot() {
  return null;
}

function parsePreviewData(raw: string | null): PreviewData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PreviewData;
  } catch {
    return null;
  }
}

export default function ArticlePreviewPage() {
  const raw = useSyncExternalStore(subscribeStorageChange, getStorageSnapshot, getStorageServerSnapshot);
  const data = parsePreviewData(raw);

  if (!data) {
    return (
      <Container className="py-10">
        <p className="text-sm text-foreground-muted">
          プレビューデータがありません。記事編集画面の「新しいタブでプレビュー」から開いてください。
        </p>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 inline-block rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-dark">
          プレビュー表示（未保存の内容です）
        </p>

        {data.categoryName && (
          <div>
            <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-contrast">
              {data.categoryName}
            </span>
          </div>
        )}
        <h1 className="mt-3 font-display text-2xl font-black leading-tight sm:text-3xl">
          {data.title || "(タイトル未入力)"}
        </h1>

        <div className="relative mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-surface-muted">
          {data.coverImageUrl ? (
            <Image src={data.coverImageUrl} alt={data.title} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <IconMug className="h-12 w-12 text-accent/50" />
            </div>
          )}
        </div>

        <div className="mt-8">
          <ArticleBody markdown={data.contentMarkdown || "(本文未入力)"} />
        </div>
      </div>
    </Container>
  );
}
