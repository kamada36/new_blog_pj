/**
 * 現行WordPressサイトの各ページから、実際に出力されている <title> と meta description を取得し、
 * このアプリのDB(Article / Page の metaTitle / metaDescription)へ反映する。
 *
 * 取り込みスクリプトは、WP REST APIの「抜粋」「タイトル」しか持ち込めない。一方、検索結果に表示される
 * タイトル・説明文はSEO設定(プラグイン等)側の値で、REST APIでは取れないため、公開ページのHTMLから読む。
 * 移行でSEO(検索結果の見え方・クリック率)を落とさないための対応。
 *
 *   npx tsx scripts/sync-seo-meta.ts           # 確認のみ(DBは変更しない。差分の件数と例を表示)
 *   npx tsx scripts/sync-seo-meta.ts --apply   # 反映する(変更前の値を scripts/data/ にバックアップ)
 *
 * 環境変数: WP_URL(省略時 https://resilient-cer.com)。認証は不要(公開ページを読むだけ)。
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decodeSlug } from "../src/lib/slug";

const APPLY = process.argv.includes("--apply");
const WP_URL = (process.env.WP_URL ?? "https://resilient-cer.com").replace(/\/+$/, "");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/** 旧サイトの固定ページのスラッグ → このアプリの固定ページのスラッグ */
const PAGE_SLUG_MAP: Record<string, string> = {
  "レジリエンサーcafeとは": "about",
  "プライバシーポリシー-免責事項": "privacy-policy",
  profile: "profile",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

/** 現行サイトへの負荷を抑えるため、一時的なエラー(429/5xx)は待ってから再試行する。 */
async function fetchText(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (seo-meta-sync)" } });
    if (res.ok) return res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) throw new Error(`HTTP ${res.status}: ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

/** サイトマップ(索引でも単体でも)から、記事/固定ページのURLを集める。 */
async function collectUrls(kind: "post" | "page"): Promise<string[]> {
  const index = await fetchText(`${WP_URL}/sitemap.xml`);
  const subs = [...index.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).filter((u) => u.includes(`${kind}-sitemap`));
  const urls: string[] = [];
  for (const sub of subs) {
    urls.push(...[...(await fetchText(sub)).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
  }
  return urls;
}

function slugOf(url: string): string {
  return decodeSlug(url.replace(WP_URL, "").replace(/^\/+|\/+$/g, "")).toLowerCase();
}

interface LiveMeta {
  title: string;
  description: string;
}

async function readLiveMeta(url: string): Promise<LiveMeta> {
  const html = await fetchText(url);
  const rawTitle = decodeEntities(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
  // 「記事タイトル | サイト名」の、末尾のサイト名(区切りの " | " 以降)を除く。
  // サイト側のテンプレート(layout.tsx)が「| レジリエンサーCafe」を付け足すため、DBには本体だけを入れる。
  const title = rawTitle.replace(/\s+[|｜]\s+[^|｜]+$/, "").trim();
  const description = decodeEntities(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? "");
  return { title, description };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function main() {
  console.log(APPLY ? "== 実行モード(DBへ反映します) ==" : "== 確認モード(DBは変更しません) ==");
  const [postUrls, pageUrls] = await Promise.all([collectUrls("post"), collectUrls("page")]);
  console.log(`現行サイト: 記事 ${postUrls.length} 件 / 固定ページ ${pageUrls.length} 件`);

  const live = new Map<string, LiveMeta>();
  await mapLimit([...postUrls, ...pageUrls], 2, async (url) => {
    live.set(url, await readLiveMeta(url));
  });

  const [articles, pages] = await Promise.all([
    prisma.article.findMany({ where: { status: "published" }, select: { id: true, slug: true, metaTitle: true, metaDescription: true } }),
    prisma.page.findMany({ select: { id: true, slug: true, metaTitle: true, metaDescription: true } }),
  ]);

  type Change = { kind: "article" | "page"; id: string; slug: string; before: { metaTitle: string; metaDescription: string }; after: { metaTitle: string; metaDescription: string } };
  const changes: Change[] = [];
  const unmatched: string[] = [];

  const articleBySlug = new Map(articles.map((a) => [decodeSlug(a.slug).toLowerCase(), a]));
  for (const url of postUrls) {
    const meta = live.get(url)!;
    const row = articleBySlug.get(slugOf(url));
    if (!row) {
      unmatched.push(url);
      continue;
    }
    const after = { metaTitle: meta.title || row.metaTitle, metaDescription: meta.description || row.metaDescription };
    if (after.metaTitle !== row.metaTitle || after.metaDescription !== row.metaDescription) {
      changes.push({ kind: "article", id: row.id, slug: row.slug, before: { metaTitle: row.metaTitle, metaDescription: row.metaDescription }, after });
    }
  }
  const pageBySlug = new Map(pages.map((p) => [p.slug, p]));
  for (const url of pageUrls) {
    const meta = live.get(url)!;
    const row = pageBySlug.get(PAGE_SLUG_MAP[slugOf(url)] ?? "");
    if (!row) continue;
    // 固定ページのタイトルは、現行側が「profile」「ﾚｼﾞﾘｴﾝｻｰCafeとは(半角カナ)」など不完全な値のため、DBの値を残す
    const after = { metaTitle: row.metaTitle, metaDescription: meta.description || row.metaDescription };
    if (after.metaTitle !== row.metaTitle || after.metaDescription !== row.metaDescription) {
      changes.push({ kind: "page", id: row.id, slug: row.slug, before: { metaTitle: row.metaTitle, metaDescription: row.metaDescription }, after });
    }
  }

  const titleChanges = changes.filter((c) => c.after.metaTitle !== c.before.metaTitle).length;
  const descChanges = changes.filter((c) => c.after.metaDescription !== c.before.metaDescription).length;
  console.log(`\n変更あり: ${changes.length} 件 (タイトル ${titleChanges} / ディスクリプション ${descChanges})`);
  if (unmatched.length) console.log(`DBに該当が無い現行URL: ${unmatched.length} 件\n  ${unmatched.join("\n  ")}`);
  for (const c of changes.slice(0, 5)) {
    console.log(`\n[${c.kind}] ${decodeSlug(c.slug).slice(0, 40)}`);
    if (c.after.metaTitle !== c.before.metaTitle) console.log(`  title  現行: ${c.after.metaTitle}\n         DB  : ${c.before.metaTitle}`);
    if (c.after.metaDescription !== c.before.metaDescription) console.log(`  desc   現行: ${c.after.metaDescription.slice(0, 80)}\n         DB  : ${c.before.metaDescription.slice(0, 80)}`);
  }

  console.log("\nタイトルの変更(全件):");
  for (const c of changes.filter((c) => c.after.metaTitle !== c.before.metaTitle)) {
    console.log(`  現行: ${c.after.metaTitle}\n  DB  : ${c.before.metaTitle}`);
  }

  if (!APPLY) {
    console.log("\n確認のみです。問題がなければ --apply を付けて実行してください。");
    return;
  }

  const dir = path.join(process.cwd(), "scripts", "data");
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `seo-meta-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backup, JSON.stringify(changes.map(({ kind, id, slug, before }) => ({ kind, id, slug, ...before })), null, 1));
  console.log(`\n変更前の値を保存しました: ${backup}`);

  for (let i = 0; i < changes.length; i += 10) {
    await Promise.all(
      changes.slice(i, i + 10).map((c) =>
        c.kind === "article"
          ? prisma.article.update({ where: { id: c.id }, data: c.after })
          : prisma.page.update({ where: { id: c.id }, data: c.after })
      )
    );
  }
  console.log(`完了: ${changes.length} 件を更新しました。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
