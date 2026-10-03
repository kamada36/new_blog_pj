"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArticleBody } from "@/components/article/ArticleBody";
import { ModelSelect } from "@/components/admin/ai/ModelSelect";
import { validateBannerHtml, type BannerLinkInput, type TextLinkInput } from "@/lib/ai/affiliate";
import { estimateGenerateCost, formatJpy } from "@/lib/ai/costs";
import { tryParseOutline } from "@/lib/ai/json";
import { countArticleChars } from "@/lib/ai/markdown";
import {
  DEFAULT_ARTICLE_MODEL,
  DEFAULT_OUTLINE_MODEL,
  OUTLINE_MODELS,
  getProviderForModel,
} from "@/lib/ai/models";
import {
  postEventStream,
  type ArticleStreamEvent,
  type OutlineStreamEvent,
  type SavedArticleInfo,
} from "@/lib/ai/stream";
import type { ShortcodePreset } from "@/lib/shortcodes";
import type { NewsItem } from "@/lib/ai/news";
import {
  loadGeneratedArticleAction,
  regenerateEyecatchAction,
  saveGeneratedArticleAction,
  scrapeUrlAction,
  searchNewsAction,
} from "./actions";
import { AffiliateFields } from "./AffiliateFields";
import { OutlinePreview } from "./OutlinePreview";

export type CategoryOption = { id: string; name: string; slug: string };
export type ApiKeyStatus = { gemini: boolean; anthropic: boolean; storage: boolean };

const TOPIC_KEYWORDS = ["転職", "IT", "AI", "仕事", "求人"];
const WORD_COUNT_OPTIONS = [3000, 4000, 5000, 6000, 8000];
const NEWS_PAGE_SIZE = 10;
const STORAGE_KEY = "admin.generate.v1";

const CARD = "rounded-2xl border border-border bg-surface p-5";
const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-dark disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent-dark disabled:opacity-50";
const EMPTY_TEXT_LINK: TextLinkInput = { url: "", anchorText: "", info: "" };
const EMPTY_BANNER_LINK: BannerLinkInput = { html: "", note: "" };

type Message = { type: "success" | "error" | "warning"; text: string } | null;

type StoredState = {
  source: string;
  wordCount: number;
  outlineModel: string;
  articleModel: string;
  categoryId: string;
  withEyecatch: boolean;
  textLinks: TextLinkInput[];
  bannerLinks: BannerLinkInput[];
  outlineRaw: string;
  articleId: string | null;
  /** 「最初からやり直す」まで残す(再生成・リロードでも消さない) */
  eyecatchPrompt: string;
};

function readStored(): Partial<StoredState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredState>) : null;
  } catch {
    return null;
  }
}

function writeStored(state: StoredState | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存できない環境(プライベートモード等)では復元を諦めるだけ
  }
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function GenerateWorkbench({
  categories,
  shortcodes,
  keys,
}: {
  categories: CategoryOption[];
  shortcodes: ShortcodePreset[];
  keys: ApiKeyStatus;
}) {
  // ── 入力 ──
  const [source, setSource] = useState("");
  const [wordCount, setWordCount] = useState(5000);
  const [outlineModel, setOutlineModel] = useState(DEFAULT_OUTLINE_MODEL);
  const [articleModel, setArticleModel] = useState(DEFAULT_ARTICLE_MODEL);
  const [categoryId, setCategoryId] = useState(""); // 空 = AIの提案に任せる
  const [withEyecatch, setWithEyecatch] = useState(true);
  const [textLinks, setTextLinks] = useState<TextLinkInput[]>([EMPTY_TEXT_LINK]);
  const [bannerLinks, setBannerLinks] = useState<BannerLinkInput[]>([EMPTY_BANNER_LINK]);
  const [scrapingIndex, setScrapingIndex] = useState<number | null>(null);

  // ── ニュース ──
  const [customKeyword, setCustomKeyword] = useState("");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsVisible, setNewsVisible] = useState(NEWS_PAGE_SIZE);

  // ── 構成案 ──
  const [outlineRaw, setOutlineRaw] = useState("");
  const [outlineBusy, setOutlineBusy] = useState(false);
  const outlineParsed = useMemo(() => tryParseOutline(outlineRaw), [outlineRaw]);

  // ── 本文・保存結果 ──
  const [articleBusy, setArticleBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "writing" | "finalizing">("idle");
  const [liveText, setLiveText] = useState("");
  const deferredLiveText = useDeferredValue(liveText);
  const [content, setContent] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [article, setArticle] = useState<SavedArticleInfo | null>(null);
  const [title, setTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [savedCategoryId, setSavedCategoryId] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [eyecatchPrompt, setEyecatchPrompt] = useState("");
  const [eyecatchBusy, setEyecatchBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewTab, setViewTab] = useState<"preview" | "markdown">("preview");
  const [instruction, setInstruction] = useState("");

  const [message, setMessage] = useState<Message>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);

  const busy = outlineBusy || articleBusy;
  const hasResult = Boolean(content) || Boolean(eyecatchPrompt) || articleBusy;

  // ── 入力内容の保存/復元(リロード・再ログインで作業が消えないように) ──
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const stored = readStored();
    if (!stored) return;
    /* eslint-disable react-hooks/set-state-in-effect -- マウント時に一度だけ、ブラウザ保存の値で初期化する */
    if (typeof stored.source === "string") setSource(stored.source);
    if (typeof stored.wordCount === "number") setWordCount(stored.wordCount);
    if (stored.outlineModel) setOutlineModel(stored.outlineModel);
    if (stored.articleModel) setArticleModel(stored.articleModel);
    if (typeof stored.categoryId === "string") setCategoryId(stored.categoryId);
    if (typeof stored.withEyecatch === "boolean") setWithEyecatch(stored.withEyecatch);
    if (stored.textLinks?.length) setTextLinks(stored.textLinks);
    if (stored.bannerLinks?.length) setBannerLinks(stored.bannerLinks);
    if (typeof stored.outlineRaw === "string") setOutlineRaw(stored.outlineRaw);
    if (typeof stored.eyecatchPrompt === "string") setEyecatchPrompt(stored.eyecatchPrompt);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (stored.articleId) {
      void loadGeneratedArticleAction(stored.articleId).then((result) => {
        if (!result.ok) return;
        const a = result.article;
        setArticle({ id: a.id, slug: a.slug, title: a.title, categoryId: a.categoryId });
        setContent(a.contentMarkdown);
        setTitle(a.title);
        setMetaDescription(a.metaDescription);
        setTags(a.tagNames);
        setSavedCategoryId(a.categoryId);
        setCoverImageUrl(a.coverImageUrl);
      });
    }
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    writeStored({
      source,
      wordCount,
      outlineModel,
      articleModel,
      categoryId,
      withEyecatch,
      textLinks,
      bannerLinks,
      outlineRaw,
      articleId: article?.id ?? null,
      eyecatchPrompt,
    });
  }, [source, wordCount, outlineModel, articleModel, categoryId, withEyecatch, textLinks, bannerLinks, outlineRaw, article, eyecatchPrompt]);

  // ── 補助 ──
  const cost = useMemo(
    () => estimateGenerateCost(outlineModel, articleModel, source.length, wordCount, withEyecatch),
    [outlineModel, articleModel, source.length, wordCount, withEyecatch]
  );

  const bannerProblem = bannerLinks.some((link) => validateBannerHtml(link.html));
  const warnings: string[] = [];
  if (!keys.gemini) warnings.push("GEMINI_API_KEY が未設定です。構成案の生成・アイキャッチ画像の生成には必須です。");
  if (getProviderForModel(articleModel) === "claude" && !keys.anthropic) {
    warnings.push("本文モデルにClaudeを選んでいますが、ANTHROPIC_API_KEY が未設定です。");
  }
  if (withEyecatch && !keys.storage) {
    warnings.push("R2(画像の保存先)の環境変数が未設定のため、アイキャッチ画像は保存できません。");
  }

  function showMessage(type: "success" | "error" | "warning", text: string) {
    setMessage({ type, text });
  }

  function stop() {
    abortRef.current?.abort();
  }

  function resetResult() {
    setContent("");
    setLiveText("");
    setTruncated(false);
    setArticle(null);
    setTitle("");
    setMetaDescription("");
    setTags([]);
    setTagInput("");
    setSavedCategoryId("");
    setCoverImageUrl(null);
    setDirty(false);
    setInstruction("");
  }

  function startOver() {
    if (busy) return;
    if (!window.confirm("入力内容と生成結果をすべてクリアして、最初からやり直します。よろしいですか?(保存済みの下書きは残ります)")) {
      return;
    }
    setSource("");
    setOutlineRaw("");
    setTextLinks([EMPTY_TEXT_LINK]);
    setBannerLinks([EMPTY_BANNER_LINK]);
    setNews([]);
    setMessage(null);
    setEyecatchPrompt("");
    resetResult();
    writeStored(null);
  }

  // ── ニュース ──
  async function handleSearch(keyword: string) {
    const query = keyword.trim();
    if (!query) return;
    setNewsLoading(true);
    setNewsVisible(NEWS_PAGE_SIZE);
    const result = await searchNewsAction(query);
    setNewsLoading(false);
    if (!result.ok) return showMessage("error", result.error);
    setNews(result.items);
    if (result.items.length === 0) showMessage("warning", "該当するニュースが見つかりませんでした。");
  }

  function selectNews(item: NewsItem) {
    const lines = [
      `【ニュースの話題】${item.title}`,
      "",
      "【ニュース要約(記事生成の元ネタ)】",
      item.detail || item.summary,
      "",
      `【補足情報】${item.summary}`,
    ];
    if (item.link) lines.push(`【参照URL】${item.link}`);
    lines.push("", "【記事で特に深掘りしたい点】読者が最初に答えを得られる構成で、具体策も入れて解説してください。");
    setSource(lines.join("\n"));
    setNews([]);
  }

  async function handleScrape(index: number) {
    const url = textLinks[index]?.url.trim();
    if (!url) return;
    setScrapingIndex(index);
    const result = await scrapeUrlAction(url);
    setScrapingIndex(null);
    if (!result.ok) return showMessage("error", result.error);
    setTextLinks((prev) => prev.map((link, i) => (i === index ? { ...link, info: result.info } : link)));
    if (result.failed) showMessage("warning", "リンク先の内容を取得できませんでした。AIがURLから内容を推測します。");
  }

  // ── STEP 1: 構成案 ──
  async function handleGenerateOutline() {
    if (busy || !source.trim()) return;
    setMessage(null);
    setOutlineBusy(true);
    setOutlineRaw("");
    const controller = new AbortController();
    abortRef.current = controller;

    let acc = "";
    try {
      await postEventStream<OutlineStreamEvent>(
        "/admin/api/generate/outline",
        { source, modelId: outlineModel, wordCount, textLinks, bannerLinks },
        (event) => {
          if (event.type === "delta") {
            acc += event.text;
            setOutlineRaw(acc);
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        },
        controller.signal
      );
    } catch (error) {
      showMessage(isAbort(error) ? "warning" : "error", isAbort(error) ? "構成案の生成を中断しました。" : errorText(error));
    } finally {
      setOutlineBusy(false);
    }
  }

  // ── STEP 2: 本文(新規) / 追加指示(既存記事の修正) ──
  async function runArticle(mode: "new" | "instruction") {
    if (busy || !source.trim()) return;
    const isInstruction = mode === "instruction";
    if (isInstruction && (!instruction.trim() || !content)) return;

    setMessage(null);
    if (!isInstruction) resetResult();
    setArticleBusy(true);
    setPhase("writing");
    setLiveText("");
    setTruncated(false);
    const controller = new AbortController();
    abortRef.current = controller;

    let live = "";
    try {
      await postEventStream<ArticleStreamEvent>(
        "/admin/api/generate/article",
        {
          source,
          wordCount,
          modelId: articleModel,
          outlineJson: outlineParsed ? JSON.stringify(outlineParsed) : undefined,
          additionalInstruction: isInstruction ? instruction : undefined,
          currentArticle: isInstruction ? content : undefined,
          articleId: isInstruction ? article?.id : undefined,
          categoryId: categoryId || undefined,
          generateEyecatch: withEyecatch,
          textLinks,
          bannerLinks,
        },
        (event) => {
          switch (event.type) {
            case "delta":
              live += event.text;
              setLiveText(live);
              break;
            case "truncated":
              setTruncated(true);
              break;
            case "phase":
              setPhase(event.phase);
              break;
            case "seo":
              setTitle(event.seo.title);
              setMetaDescription(event.seo.metaDescription);
              setTags(event.seo.tags);
              break;
            case "eyecatch":
              setEyecatchPrompt(event.prompt);
              if (event.imageUrl) setCoverImageUrl(event.imageUrl);
              if (event.error) showMessage("warning", `アイキャッチ画像の生成に失敗しました: ${event.error}`);
              break;
            case "saved":
              setArticle(event.article);
              setSavedCategoryId(event.article.categoryId);
              setContent(event.content);
              setDirty(false);
              break;
            case "error":
              throw new Error(event.message);
          }
        },
        controller.signal
      );
      if (isInstruction) setInstruction("");
      showMessage("success", "生成が完了し、下書きとして保存しました。内容を確認してください。");
    } catch (error) {
      showMessage(
        isAbort(error) ? "warning" : "error",
        isAbort(error) ? "生成を中断しました(保存はされていません)。" : errorText(error)
      );
    } finally {
      setArticleBusy(false);
      setPhase("idle");
      setLiveText("");
    }
  }

  // ── 保存・画像 ──
  async function handleSave() {
    if (saving || !content) return;
    setSaving(true);
    const result = await saveGeneratedArticleAction({
      articleId: article?.id,
      title,
      contentMarkdown: content,
      excerpt: metaDescription,
      categoryId: savedCategoryId,
      tagNames: tags,
      metaTitle: title,
      metaDescription,
      coverImageUrl,
    });
    setSaving(false);
    if (!result.ok) return showMessage("error", result.error);
    setArticle((prev) => ({
      id: result.id,
      slug: result.slug,
      title,
      categoryId: savedCategoryId || prev?.categoryId || "",
    }));
    setDirty(false);
    showMessage("success", "下書きを保存しました。");
  }

  async function handleRegenerateEyecatch() {
    if (eyecatchBusy || !eyecatchPrompt.trim()) return;
    setEyecatchBusy(true);
    const result = await regenerateEyecatchAction({ articleId: article?.id, prompt: eyecatchPrompt });
    setEyecatchBusy(false);
    if (!result.ok) return showMessage("error", result.error);
    setCoverImageUrl(result.imageUrl);
    showMessage("success", "アイキャッチ画像を再生成しました。");
  }

  function addTag() {
    const name = tagInput.trim().replace(/^[#＃]+/, "");
    if (!name) return;
    if (!tags.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setTags([...tags, name]);
      setDirty(true);
    }
    setTagInput("");
  }

  const previewText = articleBusy ? deferredLiveText : content;
  const actualChars = countArticleChars(content);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-black">AI記事生成</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            ニュースや情報をもとに、構成案 → 本文を生成し、<strong>下書き</strong>として保存します。公開は記事エディタで内容を確認してから行ってください。
          </p>
        </div>
        <button type="button" onClick={startOver} disabled={busy} className={SECONDARY_BUTTON}>
          最初からやり直す
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-accent bg-accent-soft p-4 text-sm">
          {warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}
      {message && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm font-medium ${
            message.type === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : message.type === "warning"
                ? "border-accent bg-accent-soft"
                : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* トピック */}
      <section className={CARD}>
        <h2 className="font-display text-sm font-bold">トピックスから選択</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPIC_KEYWORDS.map((keyword) => (
            <button key={keyword} type="button" onClick={() => handleSearch(keyword)} disabled={newsLoading || busy} className={SECONDARY_BUTTON}>
              {keyword}
            </button>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSearch(customKeyword);
            }}
          >
            <input
              value={customKeyword}
              onChange={(e) => setCustomKeyword(e.target.value)}
              placeholder="キーワードで検索"
              className={`${INPUT_CLASS} w-44`}
            />
            <button type="submit" disabled={newsLoading || busy || !customKeyword.trim()} className={SECONDARY_BUTTON}>
              検索
            </button>
          </form>
        </div>
        {newsLoading && <p className="mt-3 text-sm text-foreground-muted">ニュースを検索中…</p>}
        {news.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {news.slice(0, newsVisible).map((item, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => selectNews(item)}
                onKeyDown={(e) => e.key === "Enter" && selectNews(item)}
                className="cursor-pointer rounded-xl border border-border p-3 hover:border-accent"
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-foreground-muted">{item.summary}</p>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-xs font-semibold text-accent-dark hover:underline"
                  >
                    元記事を開く ↗
                  </a>
                )}
              </div>
            ))}
            {news.length > newsVisible && (
              <button
                type="button"
                onClick={() => setNewsVisible((n) => n + NEWS_PAGE_SIZE)}
                className={`${SECONDARY_BUTTON} self-center`}
              >
                さらに表示(残り{news.length - newsVisible}件)
              </button>
            )}
          </div>
        )}
      </section>

      {/* ソース */}
      <section className={CARD}>
        <label htmlFor="source" className="font-display text-sm font-bold">
          記事のネタ・ソース情報
        </label>
        <textarea
          id="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="記事にしたい最近のニュースや情報を入力してください。上のニュース一覧から選ぶと自動で入力されます。"
          rows={7}
          disabled={busy}
          className={`${INPUT_CLASS} mt-3`}
        />
        <details className="mt-4 rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">アフィリエイトリンクを入れる(任意)</summary>
          <div className="mt-3">
            <AffiliateFields
              textLinks={textLinks}
              onTextLinksChange={setTextLinks}
              bannerLinks={bannerLinks}
              onBannerLinksChange={setBannerLinks}
              onScrape={handleScrape}
              scrapingIndex={scrapingIndex}
              disabled={busy}
            />
          </div>
        </details>
      </section>

      {/* 設定 */}
      <section className={CARD}>
        <h2 className="font-display text-sm font-bold">生成設定</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <ModelSelect
            label="構成案(リサーチ)のモデル"
            value={outlineModel}
            onChange={setOutlineModel}
            models={OUTLINE_MODELS}
            disabled={busy}
            hint="Google検索で最新情報を調べるため、Geminiのみ"
          />
          <ModelSelect label="本文執筆のモデル" value={articleModel} onChange={setArticleModel} disabled={busy} />
          <div>
            <label className="text-xs font-semibold text-foreground-muted">目標文字数</label>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={WORD_COUNT_OPTIONS.includes(wordCount) ? wordCount : ""}
                onChange={(e) => e.target.value && setWordCount(Number(e.target.value))}
                disabled={busy}
                className={INPUT_CLASS}
              >
                {!WORD_COUNT_OPTIONS.includes(wordCount) && <option value="">カスタム</option>}
                {WORD_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}文字
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1000}
                max={20000}
                step={500}
                value={wordCount}
                onChange={(e) => setWordCount(Math.min(20000, Math.max(1000, Number(e.target.value) || 1000)))}
                disabled={busy}
                className={`${INPUT_CLASS} w-28`}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground-muted">カテゴリー</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy} className={`${INPUT_CLASS} mt-1`}>
              <option value="">AIの提案に任せる</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withEyecatch} onChange={(e) => setWithEyecatch(e.target.checked)} disabled={busy} />
          アイキャッチ画像もAIで生成する(1枚あたり約$0.067)
        </label>
        <p className="mt-3 text-xs text-foreground-muted">
          概算コスト: <strong className="text-foreground">{formatJpy(cost.totalCostJpy)}</strong>(構成案 ${cost.stage1CostUsd.toFixed(4)} + 本文 $
          {cost.stage2CostUsd.toFixed(4)}
          {withEyecatch ? ` + 画像 $${cost.imageCostUsd.toFixed(3)}` : ""})※トークン数からの目安で、実際の請求額とは異なります
        </p>
      </section>

      {/* STEP 1 */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-accent-dark">STEP 1</p>
            <h2 className="font-display text-sm font-bold">リサーチ & 構成案の生成</h2>
            <p className="mt-1 text-xs text-foreground-muted">Google検索で最新情報を調べ、見出し構成とファクトシートを作ります。</p>
          </div>
          <div className="flex gap-2">
            {outlineBusy && (
              <button type="button" onClick={stop} className={SECONDARY_BUTTON}>
                停止
              </button>
            )}
            <button type="button" onClick={handleGenerateOutline} disabled={busy || !source.trim() || bannerProblem} className={PRIMARY_BUTTON}>
              {outlineBusy ? "生成中…" : outlineRaw ? "構成案を作り直す" : "構成案を生成"}
            </button>
          </div>
        </div>
        {outlineRaw && (
          <div className="mt-4">
            <OutlinePreview parsed={outlineParsed} raw={outlineRaw} pending={outlineBusy} />
          </div>
        )}
      </section>

      {/* STEP 2 */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-accent-dark">STEP 2</p>
            <h2 className="font-display text-sm font-bold">本文の生成 → 下書き保存</h2>
            <p className="mt-1 text-xs text-foreground-muted">
              {outlineParsed
                ? "上の構成案に沿って本文を執筆し、SEO情報・タグ・アイキャッチとあわせて下書き保存します。"
                : "構成案なしで直接本文を生成します(STEP 1を先に行うことを推奨)。"}
            </p>
          </div>
          <div className="flex gap-2">
            {articleBusy && (
              <button type="button" onClick={stop} className={SECONDARY_BUTTON}>
                停止
              </button>
            )}
            <button type="button" onClick={() => runArticle("new")} disabled={busy || !source.trim() || bannerProblem} className={PRIMARY_BUTTON}>
              {articleBusy && !instruction ? "生成中…" : content ? "本文を作り直す(新しい下書き)" : "本文を生成"}
            </button>
          </div>
        </div>
        {bannerProblem && <p className="mt-3 text-xs font-semibold text-red-600">埋め込めない形式のバナーコードがあります。修正するか削除してください。</p>}
      </section>

      {/* 結果 */}
      {hasResult && (
        <section className={`${CARD} flex flex-col gap-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-sm font-bold">生成結果</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {articleBusy && (
                <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold">
                  {phase === "finalizing" ? "SEO情報・画像を生成し、保存しています…" : `執筆中… ${countArticleChars(deferredLiveText).toLocaleString()}文字`}
                </span>
              )}
              {!articleBusy && content && (
                <span className="rounded-full border border-border px-3 py-1 font-semibold">
                  {actualChars.toLocaleString()}文字(目標 {wordCount.toLocaleString()}文字)
                </span>
              )}
              {article && (
                <>
                  <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-800">
                    {dirty ? "未保存の変更あり" : "下書き保存済み"}
                  </span>
                  <Link href={`/admin/articles/${article.id}`} target="_blank" className="font-semibold text-accent-dark hover:underline">
                    記事エディタで開く →
                  </Link>
                </>
              )}
            </div>
          </div>

          {truncated && (
            <p className="rounded-xl border border-accent bg-accent-soft p-3 text-sm">
              ⚠ 出力が上限に達し、本文が途中で終わっている可能性があります。末尾を確認し、必要なら下の追加指示で補ってください。
            </p>
          )}

          {!articleBusy && content && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-foreground-muted">タイトル(SEOタイトル 30〜60文字目安 / 現在{title.length}文字)</label>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                  className={`${INPUT_CLASS} mt-1`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-foreground-muted">
                  メタディスクリプション(120〜155文字目安 / 現在{metaDescription.length}文字。抜粋にも使われます)
                </label>
                <textarea
                  value={metaDescription}
                  onChange={(e) => {
                    setMetaDescription(e.target.value);
                    setDirty(true);
                  }}
                  rows={3}
                  className={`${INPUT_CLASS} mt-1`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground-muted">カテゴリー</label>
                <select
                  value={savedCategoryId}
                  onChange={(e) => {
                    setSavedCategoryId(e.target.value);
                    setDirty(true);
                  }}
                  className={`${INPUT_CLASS} mt-1`}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground-muted">スラッグ(URL)</label>
                <p className="mt-1 truncate rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
                  /{article?.slug ?? "…"}/
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-foreground-muted">タグ(存在しないタグは保存時に新規作成されます)</label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
                  {tags.map((tag, i) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium">
                      {tag}
                      <button
                        type="button"
                        onClick={() => {
                          setTags(tags.filter((_, j) => j !== i));
                          setDirty(true);
                        }}
                        aria-label={`タグ「${tag}」を削除`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    onBlur={addTag}
                    placeholder="タグを追加(Enter)"
                    className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {!articleBusy && (content || eyecatchPrompt) && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-foreground-muted">アイキャッチ画像</p>
              <div className="mt-2 grid gap-4 sm:grid-cols-[16rem_1fr]">
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-surface-muted">
                  {coverImageUrl ? (
                    <Image src={coverImageUrl} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-foreground-muted">未設定</div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted">画像生成プロンプト(英語。編集して再生成できます)</label>
                  <textarea
                    value={eyecatchPrompt}
                    onChange={(e) => setEyecatchPrompt(e.target.value)}
                    rows={4}
                    className={`${INPUT_CLASS} mt-1 text-xs`}
                    placeholder="例: A warm cafe-style illustration of ..."
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateEyecatch}
                    disabled={eyecatchBusy || !eyecatchPrompt.trim() || !article}
                    className={`${SECONDARY_BUTTON} mt-2`}
                  >
                    {eyecatchBusy ? "生成中…" : "画像だけ再生成(約$0.067)"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            {!articleBusy && content && (
              <div className="mb-2 flex gap-2">
                {(["preview", "markdown"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setViewTab(tab)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${viewTab === tab ? "bg-accent text-accent-contrast" : "border border-border"}`}
                  >
                    {tab === "preview" ? "プレビュー" : "Markdownを編集"}
                  </button>
                ))}
              </div>
            )}
            {viewTab === "markdown" && !articleBusy && content ? (
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
                rows={24}
                spellCheck={false}
                className={`${INPUT_CLASS} font-mono text-xs leading-relaxed`}
              />
            ) : previewText || articleBusy ? (
              <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background p-4">
                {previewText ? <ArticleBody markdown={previewText} shortcodes={shortcodes} /> : <p className="text-sm text-foreground-muted">AIに接続しています…</p>}
              </div>
            ) : null}
          </div>

          {!articleBusy && content && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleSave} disabled={saving || !dirty} className={PRIMARY_BUTTON}>
                {saving ? "保存中…" : "変更を下書きに保存"}
              </button>
              <p className="text-xs text-foreground-muted">
                公開・スラッグの変更は「記事エディタ」から行えます。タイトルを変えてもURL(スラッグ)は変わりません。
              </p>
            </div>
          )}

          {!articleBusy && content && (
            <div className="rounded-xl border border-border p-4">
              <label className="text-sm font-semibold">追加指示で本文を修正</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder="修正したい内容や追加したい情報を入力してください(例: まとめをもう少し短くして、体験談を1つ追加する)"
                className={`${INPUT_CLASS} mt-2`}
              />
              <button
                type="button"
                onClick={() => runArticle("instruction")}
                disabled={busy || !instruction.trim() || dirty}
                className={`${PRIMARY_BUTTON} mt-2`}
              >
                この指示で修正して上書き保存
              </button>
              {dirty && <p className="mt-2 text-xs text-foreground-muted">手動の変更が未保存です。先に「変更を下書きに保存」してください。</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "不明なエラーが発生しました。";
}
