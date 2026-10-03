import type { ParsedOutline } from "@/lib/ai/json";

/** 構成案(JSON)の読みやすい表示。ストリーミング受信中はJSONが閉じておらずパースできないのが正常。 */
export function OutlinePreview({
  parsed,
  raw,
  pending,
}: {
  parsed: ParsedOutline | null;
  raw: string;
  pending: boolean;
}) {
  if (!raw.trim()) return null;

  if (!parsed) {
    return (
      <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
        {!pending && (
          <p className="mb-2 text-xs font-semibold text-accent-dark">
            ⚠ 構成案の解析に失敗しました。もう一度生成し直してください。
          </p>
        )}
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-foreground-muted">{raw}</pre>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
      {parsed.title && <p className="font-display text-base font-bold">📰 {parsed.title}</p>}
      {parsed.metaDescription && <p className="mt-2 text-xs text-foreground-muted">🔍 {parsed.metaDescription}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {parsed.slug && (
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs">/{parsed.slug}/</span>
        )}
        {parsed.categorySlug && (
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs">
            カテゴリー: {parsed.categorySlug}
          </span>
        )}
        {parsed.targetKeywords?.map((keyword, i) => (
          <span key={i} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium">
            {keyword}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {parsed.sections?.map((section, i) => (
          <div key={i}>
            <p className="font-semibold">H2: {section.h2}</p>
            {section.subsections?.map((sub, j) => (
              <p key={j} className="ml-4 text-xs text-foreground-muted">
                └ H3: {sub.h3}
              </p>
            ))}
          </div>
        ))}
      </div>
      {parsed.affiliateNotes && parsed.affiliateNotes.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {parsed.affiliateNotes.map((note, i) => (
            <p key={i} className="text-xs text-accent-dark">
              💰 {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
