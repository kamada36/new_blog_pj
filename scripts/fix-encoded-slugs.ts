/**
 * DBに「%e8%a3%bd...」のようにパーセントエンコードされたまま保存されているスラッグを、日本語(デコード済み)へ直す。
 *
 * WordPressは日本語のスラッグを %xx 形式で持っており、取り込みスクリプトがそのまま保存していたため、
 * 新サイトの記事ページ(URLをデコードしてからスラッグで検索する)が一致せず404になっていた。
 * 現行サイトのURL(https://resilient-cer.com/<日本語スラッグ>/)と同じ形に揃えるのが目的。
 *
 *   npx tsx scripts/fix-encoded-slugs.ts           # 確認のみ(DBは変更しない)
 *   npx tsx scripts/fix-encoded-slugs.ts --apply   # 実際に書き換える
 *
 * 対象は Article / Tag / Category。重複・予約語との衝突が1件でもあれば、何も書き換えずに中止する。
 * ただしタグだけは、デコード後のスラッグが「同名の既存タグ」と重なる場合に限り、記事を付け替えて統合する
 * (取り込み済みタグと、後から画面/AI生成で作られた同名タグの重複を解消するため)。
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { RESERVED_SLUGS, decodeSlug } from "../src/lib/slug";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Row = { id: string; slug: string; name?: string };

function plan(label: string, rows: Row[], others: Set<string>, mergeSameName = false) {
  const encoded = rows.filter((r) => r.slug.includes("%") && decodeSlug(r.slug) !== r.slug);

  // タグ: デコード後のスラッグが同名の既存タグと同じなら、書き換えずに統合する
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const merges: { from: Row; into: Row }[] = [];
  if (mergeSameName) {
    for (const row of encoded) {
      const existing = bySlug.get(decodeSlug(row.slug));
      if (existing && existing.id !== row.id && existing.name?.toLowerCase() === row.name?.toLowerCase()) {
        merges.push({ from: row, into: existing });
      }
    }
  }
  const mergedIds = new Set(merges.map((m) => m.from.id));
  const targets = encoded.filter((r) => !mergedIds.has(r.id));

  // 書き換え後のスラッグが、重複・他の種類・予約語と衝突しないか
  const after = new Map(rows.filter((r) => !mergedIds.has(r.id)).map((r) => [r.id, r.slug]));
  for (const row of targets) after.set(row.id, decodeSlug(row.slug));
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const [id, slug] of after) {
    if (seen.has(slug)) problems.push(`${label}: 重複 "${slug}" (${seen.get(slug)} と ${id})`);
    seen.set(slug, id);
    if (others.has(slug)) problems.push(`${label}: 他の種類のスラッグ/予約語と衝突 "${slug}"`);
  }

  console.log(`\n[${label}] 書き換え ${targets.length} 件 / 統合 ${merges.length} 件`);
  if (label !== "Tag") for (const row of targets) console.log(`  ${row.slug}\n   → ${decodeSlug(row.slug)}`);
  for (const m of merges) console.log(`  統合: ${m.from.slug} (${m.from.id}) を ${m.into.slug} (${m.into.id}) へ`);
  return { targets, merges, problems };
}

async function main() {
  console.log(APPLY ? "== 実行モード(DBを書き換えます) ==" : "== 確認モード(DBは変更しません) ==");
  const [articles, tags, categories, pages] = await Promise.all([
    prisma.article.findMany({ select: { id: true, slug: true } }),
    prisma.tag.findMany({ select: { id: true, slug: true, name: true } }),
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.page.findMany({ select: { slug: true } }),
  ]);

  // 記事はサイト直下の /{slug}/ で表示するため、固定ページ・予約パスとも重ならないこと
  const articleOthers = new Set<string>([...RESERVED_SLUGS, ...pages.map((p) => p.slug)]);
  const a = plan("Article", articles, articleOthers);
  const t = plan("Tag", tags, new Set(), true);
  const c = plan("Category", categories, new Set());

  const problems = [...a.problems, ...t.problems, ...c.problems];
  if (problems.length > 0) {
    console.error("\n中止: 次の問題があります。");
    for (const p of problems) console.error("  - " + p);
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("\n確認のみです。問題がなければ --apply を付けて実行してください。");
    return;
  }

  // タグの統合: 付いていた記事を統合先へ付け替えてから、重複していたタグを削除する
  for (const m of t.merges) {
    const moved = await prisma.article.findMany({
      where: { tags: { some: { id: m.from.id } } },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.tag.update({ where: { id: m.into.id }, data: { articles: { connect: moved } } }),
      prisma.tag.delete({ where: { id: m.from.id } }),
    ]);
  }
  // 1件ずつ独立した更新(衝突は上で検査済み)。一括のトランザクションだとDBの時間制限(5秒)を超えるため、小分けで実行する。
  // 途中で止まっても、再実行すれば残りだけが対象になる。
  const updates = [
    ...a.targets.map((r) => () => prisma.article.update({ where: { id: r.id }, data: { slug: decodeSlug(r.slug) } })),
    ...t.targets.map((r) => () => prisma.tag.update({ where: { id: r.id }, data: { slug: decodeSlug(r.slug) } })),
    ...c.targets.map((r) => () => prisma.category.update({ where: { id: r.id }, data: { slug: decodeSlug(r.slug) } })),
  ];
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(updates.slice(i, i + 10).map((run) => run()));
    console.log(`  ${Math.min(i + 10, updates.length)}/${updates.length}`);
  }
  console.log(
    `\n完了: Article ${a.targets.length} / Tag ${t.targets.length}(統合 ${t.merges.length}) / Category ${c.targets.length} 件を書き換えました。`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
