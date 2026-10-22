import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { contentPath } from "@/lib/slug";
import { formatDate } from "@/lib/format";
import { BarChart, formatDayKey } from "@/components/admin/BarChart";
import {
  buildMatrix,
  buildRanking,
  dailySeries,
  loadViewRows,
  summarize,
  type RankingRow,
} from "@/lib/viewAnalytics";

// 閲覧数分析: サイト全体の日別グラフ / 記事のランキング(期間・絞り込み・並べ替え) / 記事×日付の表 / 記事ごとの日別推移。
// 数字は「同じ訪問者の同じ記事は24時間に1回」の記録(新サイトの公開=2026-10-14以降)を、日本時間の日付で数えたもの。

const PERIODS = [
  { value: "today", label: "本日" },
  { value: "yesterday", label: "昨日" },
  { value: "7d", label: "直近7日" },
  { value: "30d", label: "直近30日" },
  { value: "all", label: "累計" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const SORTS = [
  { value: "views", label: "閲覧数" },
  { value: "published", label: "公開日" },
  { value: "title", label: "タイトル" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

// ランキング表の列の見出し(選択肢の名前より短くする)
const COLUMN_LABELS: Record<Period, string> = { today: "本日", yesterday: "昨日", "7d": "7日", "30d": "30日", all: "累計" };

const RANKING_LIMIT = 100;
const MATRIX_DAYS = [14, 30, 60] as const;
const MATRIX_LIMITS = [20, 50] as const;
const CHART_DAYS = [30, 60, 90] as const;

const INPUT_CLASS = "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const CARD_CLASS = "rounded-2xl border border-border bg-surface p-5";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function oneOf<T extends string | number>(value: string, allowed: readonly T[], fallback: T): T {
  const match = allowed.find((candidate) => String(candidate) === value);
  return match ?? fallback;
}

function viewsFor(row: RankingRow, period: Period): number {
  switch (period) {
    case "today":
      return row.today;
    case "yesterday":
      return row.yesterday;
    case "7d":
      return row.week;
    case "30d":
      return row.month;
    default:
      return row.total;
  }
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const sp = await searchParams;
  const period = oneOf(first(sp.period), PERIODS.map((p) => p.value), "7d") as Period;
  const sort = oneOf(first(sp.sort), SORTS.map((s) => s.value), "views") as Sort;
  const order = first(sp.order) === "asc" ? "asc" : "desc";
  const categoryId = first(sp.categoryId);
  const q = first(sp.q).trim();
  const minRaw = first(sp.min);
  const maxRaw = first(sp.max);
  const min = minRaw !== "" && Number.isFinite(Number(minRaw)) ? Number(minRaw) : null;
  const max = maxRaw !== "" && Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : null;
  const mdays = oneOf(first(sp.mdays), MATRIX_DAYS, 14);
  const mlimit = oneOf(first(sp.mlimit), MATRIX_LIMITS, 20);
  const cdays = oneOf(first(sp.cdays), CHART_DAYS, 30);
  const articleId = first(sp.article);
  const showZero = first(sp.zero) === "1";

  const rowsNeeded = Math.max(30, mdays, cdays);
  const [categories, articles, rows, totalAgg, selectedArticle] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
    prisma.article.findMany({
      where: {
        status: "published",
        ...(categoryId ? { categoryId } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      select: { id: true, title: true, slug: true, viewCount: true, publishedAt: true, category: { select: { name: true } } },
    }),
    loadViewRows(rowsNeeded),
    prisma.article.aggregate({ where: { status: "published" }, _sum: { viewCount: true } }),
    articleId ? prisma.article.findUnique({ where: { id: articleId }, select: { id: true, title: true, slug: true } }) : null,
  ]);

  const summary = summarize(rows);
  const siteDaily = dailySeries(rows, cdays);

  // ランキング: 選択した期間の閲覧数で、絞り込み・並べ替え
  const allRanked = buildRanking(articles, rows).map((row) => ({ row, value: viewsFor(row, period) }));
  // 選んだ期間の閲覧が0件の記事は、どの条件でも出さない(0同士は並び順に意味がなく、閲覧と無関係な記事が上位に見えてしまう)。
  // 閲覧が0件の記事も見たいときだけ、「閲覧0の記事も表示」にチェックを入れる(閲覧数の範囲を指定していても同じ)。
  const hideZero = !showZero;
  const ranking = allRanked.filter(
    ({ value }) => (!hideZero || value > 0) && (min === null || value >= min) && (max === null || value <= max)
  );
  const hiddenZeroCount = hideZero ? allRanked.length - ranking.length : 0;
  const dir = order === "asc" ? 1 : -1;
  ranking.sort((a, b) => {
    if (sort === "title") return dir * a.row.title.localeCompare(b.row.title, "ja");
    if (sort === "published") return dir * ((a.row.publishedAt?.getTime() ?? 0) - (b.row.publishedAt?.getTime() ?? 0));
    // 閲覧数順: 選んだ期間の閲覧数。同点は、より広い期間(7日 → 30日 → 累計)の閲覧数が多い順
    return (
      dir * (a.value - b.value) ||
      b.row.week - a.row.week ||
      b.row.month - a.row.month ||
      b.row.total - a.row.total
    );
  });
  const rankingShown = ranking.slice(0, RANKING_LIMIT);

  const matrix = buildMatrix(articles, rows, mdays, mlimit);
  const selectedDaily = selectedArticle ? dailySeries(rows, cdays, selectedArticle.id) : null;

  // 現在の条件を保ったまま、一部だけ変えたリンクを作る
  const href = (overrides: Record<string, string | undefined>, hash = "") => {
    const current: Record<string, string> = {
      period, sort, order, categoryId, q, min: minRaw, max: maxRaw, zero: showZero ? "1" : "",
      mdays: String(mdays), mlimit: String(mlimit), cdays: String(cdays), article: articleId,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...current, ...overrides })) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
    const query = params.toString();
    return `/admin/analytics${query ? `?${query}` : ""}${hash}`;
  };
  const tab = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-foreground text-background" : "border border-border hover:border-accent hover:text-accent-dark"}`;

  const periodLabel = PERIODS.find((p) => p.value === period)!.label;
  const exportQuery = categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : "";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-black">閲覧数分析</h1>
          <p className="mt-1 text-xs text-foreground-muted">
            日付は日本時間。同じ訪問者の同じ記事は24時間に1回と数えます。日別・期間別は新サイト公開(2026-10-14)以降の記録で、
            「累計」だけは旧サイトからの引き継ぎ分を含みます。
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <a href={`/admin/api/analytics/export/?type=ranking${exportQuery}`} className={tab(false)}>
            ランキングをCSVで保存
          </a>
          <a href={`/admin/api/analytics/export/?type=daily&days=${cdays}${exportQuery}`} className={tab(false)}>
            日別(記事ごと)をCSVで保存
          </a>
        </div>
      </div>

      {/* 概要 */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "本日の閲覧数", value: summary.today.views, sub: `訪問者 ${summary.today.visitors.toLocaleString()}` },
          { label: "昨日の閲覧数", value: summary.yesterday.views, sub: `訪問者 ${summary.yesterday.visitors.toLocaleString()}` },
          { label: "直近7日の閲覧数", value: summary.week.views, sub: `訪問者 ${summary.week.visitors.toLocaleString()}` },
          { label: "直近30日の閲覧数", value: summary.month.views, sub: `訪問者 ${summary.month.visitors.toLocaleString()}` },
          { label: "累計(引き継ぎ分を含む)", value: totalAgg._sum.viewCount ?? 0, sub: "公開中の記事の合計" },
        ].map((card) => (
          <div key={card.label} className={CARD_CLASS}>
            <p className="text-xs font-semibold text-foreground-muted">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-black">{card.value.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-foreground-muted">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* サイト全体の日別 */}
      <section className={`mt-8 ${CARD_CLASS}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold">サイト全体の日別閲覧数</h2>
          <div className="flex gap-2">
            {CHART_DAYS.map((d) => (
              <Link key={d} href={href({ cdays: String(d) })} className={tab(d === cdays)}>
                {d}日
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <BarChart data={siteDaily} />
        </div>
      </section>

      {/* 記事ごとの日別推移(ランキングの「日別」から開く) */}
      {selectedArticle && selectedDaily && (
        <section id="article-chart" className={`mt-8 ${CARD_CLASS}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold">
              記事の日別推移: <Link href={contentPath(selectedArticle.slug)} target="_blank" className="text-accent-dark hover:underline">{selectedArticle.title}</Link>
            </h2>
            <Link href={href({ article: undefined })} className="text-xs font-semibold text-foreground-muted hover:underline">
              閉じる ×
            </Link>
          </div>
          <div className="mt-4">
            <BarChart data={selectedDaily} />
          </div>
        </section>
      )}

      {/* ランキング */}
      <section className="mt-8">
        <h2 className="font-display text-sm font-bold">記事のランキング({periodLabel}の閲覧数)</h2>
        <form method="GET" className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
          <input type="hidden" name="mdays" value={mdays} />
          <input type="hidden" name="mlimit" value={mlimit} />
          <input type="hidden" name="cdays" value={cdays} />
          <div className="min-w-[110px]">
            <label className="text-xs font-semibold text-foreground-muted">期間</label>
            <select name="period" defaultValue={period} className={INPUT_CLASS}>
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs font-semibold text-foreground-muted">カテゴリー</label>
            <select name="categoryId" defaultValue={categoryId} className={INPUT_CLASS}>
              <option value="">すべて</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="text-xs font-semibold text-foreground-muted">タイトル検索</label>
            <input type="text" name="q" defaultValue={q} placeholder="タイトルで検索" className={INPUT_CLASS} />
          </div>
          <div className="w-24">
            <label className="text-xs font-semibold text-foreground-muted">閲覧数 以上</label>
            <input type="number" name="min" min={0} defaultValue={minRaw} className={INPUT_CLASS} />
          </div>
          <div className="w-24">
            <label className="text-xs font-semibold text-foreground-muted">閲覧数 以下</label>
            <input type="number" name="max" min={0} defaultValue={maxRaw} className={INPUT_CLASS} />
          </div>
          <div className="min-w-[110px]">
            <label className="text-xs font-semibold text-foreground-muted">並べ替え</label>
            <select name="sort" defaultValue={sort} className={INPUT_CLASS}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="min-w-[100px]">
            <label className="text-xs font-semibold text-foreground-muted">順序</label>
            <select name="order" defaultValue={order} className={INPUT_CLASS}>
              <option value="desc">多い・新しい順</option>
              <option value="asc">少ない・古い順</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 py-2 text-xs font-semibold text-foreground-muted">
            <input type="checkbox" name="zero" value="1" defaultChecked={showZero} />
            閲覧0の記事も表示
          </label>
          <button type="submit" className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90">
            絞り込む
          </button>
          <Link href="/admin/analytics" className="py-2 text-xs font-semibold text-foreground-muted hover:underline">
            リセット
          </Link>
        </form>

        <p className="mt-3 text-xs text-foreground-muted">
          該当 {ranking.length.toLocaleString()} 件{ranking.length > RANKING_LIMIT ? `(上位${RANKING_LIMIT}件を表示)` : ""}
          {hiddenZeroCount > 0 ? ` ・ ${periodLabel}の閲覧が0件の記事 ${hiddenZeroCount.toLocaleString()} 件は非表示(「閲覧0の記事も表示」で表示できます)` : ""}
          {period === "all" ? " ・ 累計は旧サイトからの引き継ぎ分を含みます" : ""}
        </p>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs text-foreground-muted">
              <tr>
                <th className="px-4 py-3">順位</th>
                <th className="px-4 py-3">記事</th>
                {PERIODS.map((p) => (
                  <th key={p.value} className={`px-4 py-3 text-right ${p.value === period ? "font-black text-foreground" : ""}`}>
                    {COLUMN_LABELS[p.value]}
                  </th>
                ))}
                <th className="px-4 py-3">日別</th>
              </tr>
            </thead>
            <tbody>
              {rankingShown.map(({ row }, i) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs text-foreground-muted">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <Link href={contentPath(row.slug)} target="_blank" className="font-medium hover:text-accent-dark">
                      {row.title}
                    </Link>
                    <p className="text-[11px] text-foreground-muted">
                      {row.categoryName}{row.publishedAt ? ` ・ ${formatDate(row.publishedAt)}` : ""}
                    </p>
                  </td>
                  {PERIODS.map((p) => (
                    <td
                      key={p.value}
                      className={`px-4 py-2.5 text-right ${p.value === period ? "bg-accent-soft/40 font-display font-black" : ""}`}
                    >
                      {viewsFor(row, p.value).toLocaleString()}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <Link href={href({ article: row.id }, "#article-chart")} className="text-xs font-semibold text-accent-dark hover:underline">
                      推移を見る
                    </Link>
                  </td>
                </tr>
              ))}
              {rankingShown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-foreground-muted">
                    {hideZero && hiddenZeroCount > 0
                      ? `${periodLabel}に閲覧された記事は、${period === "today" ? "まだありません。日付が変わった直後などは、閲覧の記録がありません。" : "ありません。"}`
                      : "条件に合う記事がありません。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 記事×日付 */}
      <section className={`mt-8 ${CARD_CLASS}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold">どの日にどの記事が見られたか(上位{mlimit}記事 × 直近{mdays}日)</h2>
          <div className="flex flex-wrap gap-2">
            {MATRIX_DAYS.map((d) => (
              <Link key={d} href={href({ mdays: String(d) })} className={tab(d === mdays)}>{d}日</Link>
            ))}
            <span className="w-2" />
            {MATRIX_LIMITS.map((n) => (
              <Link key={n} href={href({ mlimit: String(n) })} className={tab(n === mlimit)}>上位{n}</Link>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-foreground-muted">
          カテゴリー・タイトル検索の絞り込みが反映されます。色が濃いほど、その日の閲覧が多い記事です。
        </p>
        {matrix.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-foreground-muted">この期間の閲覧の記録がありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[220px] max-w-[260px] border-b border-border bg-surface px-2 py-2 text-left font-semibold text-foreground-muted">
                    記事
                  </th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold text-foreground-muted">計</th>
                  {matrix.keys.map((key) => (
                    <th key={key} className="whitespace-nowrap border-b border-border px-1.5 py-2 text-center font-medium text-foreground-muted">
                      {formatDayKey(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 z-10 max-w-[260px] truncate border-b border-border bg-surface px-2 py-1.5">
                      <Link href={href({ article: r.id }, "#article-chart")} title={r.title} className="hover:text-accent-dark">
                        {r.title}
                      </Link>
                    </td>
                    <td className="border-b border-border px-2 py-1.5 text-right font-semibold">{r.total.toLocaleString()}</td>
                    {r.counts.map((n, i) => (
                      <td
                        key={matrix.keys[i]}
                        className="border-b border-border px-1.5 py-1.5 text-center"
                        style={n > 0 ? { backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(18 + (72 * n) / matrix.max)}%, white)` } : undefined}
                      >
                        {n > 0 ? n : <span className="text-border">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-10 bg-surface-muted px-2 py-2 text-left font-semibold">日別合計(該当する全記事)</td>
                  <td className="bg-surface-muted px-2 py-2 text-right font-semibold">{matrix.dayTotals.reduce((s, n) => s + n, 0).toLocaleString()}</td>
                  {matrix.dayTotals.map((n, i) => (
                    <td key={matrix.keys[i]} className="bg-surface-muted px-1.5 py-2 text-center font-semibold">{n || ""}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
