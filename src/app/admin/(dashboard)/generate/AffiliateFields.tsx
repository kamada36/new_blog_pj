"use client";

import {
  MAX_LINKS_PER_TYPE,
  validateBannerHtml,
  type BannerLinkInput,
  type TextLinkInput,
} from "@/lib/ai/affiliate";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const SMALL_BUTTON =
  "rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";

export function AffiliateFields({
  textLinks,
  onTextLinksChange,
  bannerLinks,
  onBannerLinksChange,
  onScrape,
  scrapingIndex,
  disabled,
}: {
  textLinks: TextLinkInput[];
  onTextLinksChange: (links: TextLinkInput[]) => void;
  bannerLinks: BannerLinkInput[];
  onBannerLinksChange: (links: BannerLinkInput[]) => void;
  onScrape: (index: number) => void;
  scrapingIndex: number | null;
  disabled: boolean;
}) {
  const updateText = (index: number, patch: Partial<TextLinkInput>) =>
    onTextLinksChange(textLinks.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  const updateBanner = (index: number, patch: Partial<BannerLinkInput>) =>
    onBannerLinksChange(bannerLinks.map((link, i) => (i === index ? { ...link, ...patch } : link)));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-foreground-muted">
        AIにはURL・バナーのコードを見せず、本文中の「置きたい位置」だけを決めさせ、生成後に元のリンクをそのまま差し込みます。
        入力順が同じテキストリンクとバナーは「同一商品のセット」として隣り合わせに配置されます。
      </p>

      <div>
        <p className="text-sm font-semibold">テキストリンク(最大{MAX_LINKS_PER_TYPE}本)</p>
        <div className="mt-2 flex flex-col gap-3">
          {textLinks.map((link, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => updateText(i, { url: e.target.value, info: "" })}
                  placeholder="https://example.com/product/..."
                  disabled={disabled}
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => onScrape(i)}
                  disabled={disabled || !link.url.trim() || scrapingIndex !== null}
                  className={`${SMALL_BUTTON} shrink-0`}
                >
                  {scrapingIndex === i ? "取得中…" : "内容を取得"}
                </button>
                <button
                  type="button"
                  onClick={() => onTextLinksChange(textLinks.filter((_, j) => j !== i))}
                  disabled={disabled || textLinks.length <= 1}
                  className={`${SMALL_BUTTON} shrink-0`}
                  aria-label="このテキストリンクを削除"
                >
                  削除
                </button>
              </div>
              <input
                type="text"
                value={link.anchorText}
                onChange={(e) => updateText(i, { anchorText: e.target.value })}
                placeholder="リンクテキスト(例: 公式サイトで詳細を見る)※このまま記事に使われます"
                disabled={disabled}
                className={`${INPUT_CLASS} mt-2`}
              />
              {link.info && (
                <p className="mt-2 line-clamp-2 text-xs text-foreground-muted">取得した情報: {link.info}</p>
              )}
            </div>
          ))}
        </div>
        {textLinks.length < MAX_LINKS_PER_TYPE && (
          <button
            type="button"
            onClick={() => onTextLinksChange([...textLinks, { url: "", anchorText: "", info: "" }])}
            disabled={disabled}
            className={`${SMALL_BUTTON} mt-2`}
          >
            ＋ テキストリンクを追加
          </button>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold">バナーリンク(最大{MAX_LINKS_PER_TYPE}本)</p>
        <p className="mt-1 text-xs text-foreground-muted">
          ASPの「画像リンク型」のコード(&lt;a&gt;&lt;img&gt;&lt;/a&gt;)に対応。本文はMarkdownのため、バナーは
          「画像付きリンク」に変換して埋め込みます(JavaScriptタグ型は非対応)。
        </p>
        <div className="mt-2 flex flex-col gap-3">
          {bannerLinks.map((link, i) => {
            const problem = validateBannerHtml(link.html);
            return (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <textarea
                    value={link.html}
                    onChange={(e) => updateBanner(i, { html: e.target.value })}
                    placeholder="ASP(A8.netなど)からコピーしたバナーのHTMLをそのまま貼り付け"
                    rows={3}
                    disabled={disabled}
                    className={`${INPUT_CLASS} font-mono text-xs`}
                  />
                  <button
                    type="button"
                    onClick={() => onBannerLinksChange(bannerLinks.filter((_, j) => j !== i))}
                    disabled={disabled || bannerLinks.length <= 1}
                    className={`${SMALL_BUTTON} shrink-0`}
                    aria-label="このバナーを削除"
                  >
                    削除
                  </button>
                </div>
                {problem && <p className="mt-1 text-xs font-semibold text-red-600">{problem}</p>}
                <input
                  type="text"
                  value={link.note ?? ""}
                  onChange={(e) => updateBanner(i, { note: e.target.value })}
                  placeholder="商品名・概要(任意。AIが挿入位置を判断する参考で、記事には表示されません)"
                  disabled={disabled}
                  className={`${INPUT_CLASS} mt-2`}
                />
              </div>
            );
          })}
        </div>
        {bannerLinks.length < MAX_LINKS_PER_TYPE && (
          <button
            type="button"
            onClick={() => onBannerLinksChange([...bannerLinks, { html: "", note: "" }])}
            disabled={disabled}
            className={`${SMALL_BUTTON} mt-2`}
          >
            ＋ バナーリンクを追加
          </button>
        )}
      </div>
    </div>
  );
}
