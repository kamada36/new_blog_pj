"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { MediaPickerModal } from "@/components/admin/MediaPickerModal";
import type { MediaItem } from "@/app/admin/(dashboard)/media/actions";

/**
 * 画像項目用の共通フィールド。ローカルファイルのアップロードと、メディアライブラリからの
 * 選択のどちらにも対応する。選択結果は `name`(ファイル)または `${name}Url`(隠しフィールド、
 * ライブラリ選択時のURL)としてフォームに送信され、サーバー側では `resolveImageField` で解決する。
 *
 * 呼び出し元はServer Componentであることが多いため、プレビューの見た目は関数ではなく
 * クラス名(文字列)で渡す(関数props はServer→Client境界を越えられないため)。
 */
export function ImagePickerField({
  name,
  accept = "image/*",
  fallback,
  previewClassName = "h-16 w-16 rounded-lg object-cover",
  previewAspectClassName,
  onSelect,
  buttonLabel = "ライブラリから選択",
  layout = "row",
}: {
  name: string;
  accept?: string;
  /** まだ何も選択していないときに表示するプレビュー(既存の画像など)。 */
  fallback?: React.ReactNode;
  /** 固定サイズ(64x64)プレビュー用のクラス名。previewAspectClassName指定時は無視される。 */
  previewClassName?: string;
  /** 指定すると、固定サイズではなくアスペクト比ボックス(例: "aspect-[16/9]")でプレビューする。 */
  previewAspectClassName?: string;
  onSelect?: (url: string) => void;
  buttonLabel?: string;
  layout?: "row" | "stack";
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [libraryUrl, setLibraryUrl] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setLibraryUrl("");
    onSelect?.(url);
  }

  function handleSelect(item: MediaItem) {
    setPreview(item.url);
    setLibraryUrl(item.url);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPickerOpen(false);
    onSelect?.(item.url);
  }

  return (
    <div className={layout === "stack" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-3"}>
      {preview ? (
        previewAspectClassName ? (
          <div
            className={`relative w-full max-w-xs overflow-hidden rounded-lg bg-surface-muted ${previewAspectClassName}`}
          >
            <Image src={preview} alt="" fill className="object-cover" unoptimized />
          </div>
        ) : (
          <Image src={preview} alt="" width={64} height={64} className={previewClassName} unoptimized />
        )
      ) : (
        fallback
      )}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          name={name}
          accept={accept}
          onChange={handleFileChange}
          className="min-w-[160px] flex-1 text-xs outline-none file:mr-2 file:rounded-full file:border-0 file:bg-accent-soft file:px-2 file:py-1 file:text-xs"
        />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark"
        >
          {buttonLabel}
        </button>
      </div>
      <input type="hidden" name={`${name}Url`} value={libraryUrl} />
      <MediaPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelect} />
    </div>
  );
}
