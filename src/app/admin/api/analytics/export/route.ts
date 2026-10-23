import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildRanking, jstDateKey, loadViewRows, MAX_ANALYTICS_DAYS, recentDays } from "@/lib/viewAnalytics";
import { unauthorizedResponse } from "@/lib/ai/httpResponses";

// 閲覧数分析のCSV出力(Excelで文字化けしないよう、BOM付きのUTF-8)。
//   type=ranking : 記事ごとの 今日 / 昨日 / 直近7日 / 直近30日 / 累計
//   type=daily   : 日付ごとの 記事別の閲覧数(閲覧のあった組み合わせのみ。days=7〜90日)
function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvResponse(lines: (string | number)[][], filename: string): Response {
  const body = "\uFEFF" + lines.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const type = params.get("type") === "daily" ? "daily" : "ranking";
  const categoryId = params.get("categoryId") || undefined;
  const days = Math.min(Math.max(Number(params.get("days")) || 30, 7), MAX_ANALYTICS_DAYS);
  const today = jstDateKey(new Date());

  const articles = await prisma.article.findMany({
    where: { status: "published", ...(categoryId ? { categoryId } : {}) },
    select: { id: true, title: true, slug: true, viewCount: true, publishedAt: true, category: { select: { name: true } } },
  });

  if (type === "ranking") {
    const rows = await loadViewRows(30);
    const ranking = buildRanking(articles, rows).sort((a, b) => b.month - a.month || b.total - a.total);
    return csvResponse(
      [
        ["タイトル", "スラッグ", "カテゴリー", "公開日", "本日", "昨日", "直近7日", "直近30日", "累計"],
        ...ranking.map((r) => [r.title, r.slug, r.categoryName, r.publishedAt ? jstDateKey(r.publishedAt) : "", r.today, r.yesterday, r.week, r.month, r.total]),
      ],
      `views-ranking-${today}.csv`
    );
  }

  const rows = await loadViewRows(days);
  const { keys } = recentDays(days);
  const meta = new Map(articles.map((a) => [a.id, a]));
  const counts = new Map<string, number>(); // `${日付}\t${記事ID}`
  for (const row of rows) {
    if (!meta.has(row.articleId)) continue;
    const key = `${jstDateKey(row.createdAt)}\t${row.articleId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const records = [...counts.entries()]
    .map(([key, views]) => {
      const [date, id] = key.split("\t");
      const a = meta.get(id)!;
      return { date, title: a.title, slug: a.slug, category: a.category.name, views };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.views - a.views));
  return csvResponse(
    [["日付", "スラッグ", "タイトル", "カテゴリー", "閲覧数"], ...records.map((r) => [r.date, r.slug, r.title, r.category, r.views])],
    `views-daily-${keys[0]}_${keys[keys.length - 1]}.csv`
  );
}
