/**
 * 旧WordPressサイトのURLが、新サイトで(転送を含め)正しく開くかを一括で検証する。
 * 仮のデプロイ先・切り替え直後の本番・ローカルのどれに対しても使える。読み取りだけで、DBやサイトは変更しない。
 *
 *   npx tsx scripts/check-urls.ts <新サイトのURL> [オプション]
 *
 *   例) npx tsx scripts/check-urls.ts https://xxx.netlify.app
 *       npx tsx scripts/check-urls.ts https://resilient-cer.com --expect-index
 *
 * オプション:
 *   --old <URL>               現行サイトのURL(省略時 $WP_URL または https://resilient-cer.com)
 *   --canonical-origin <URL>  期待するcanonicalのオリジン(省略時 --old と同じ。本番URLを設定した環境ではこれで一致する)
 *   --expect-noindex          トップが X-Robots-Tag: noindex を返すことを検証する(切り替え前の仮のデプロイ先向け)
 *   --expect-index            noindex が付いていないことを検証する(切り替え後の本番向け)
 *
 * 確認する内容: ① 現行の記事URL全件が同じパスで200・canonicalが現行と一致・構造化データ・タイトル形式
 *   ② 固定ページ・ページ送り・日付アーカイブ等の転送 ③ 主要ページ・フィード・サイトマップ(現行の記事URLと完全一致)
 * 記事ページはアクセスで閲覧数が記録されるため、ボット判定されるUser-Agentで要求する(閲覧数は増えない)。
 * どれか1つでも失敗すると、終了コード1で終わる。
 */
import "dotenv/config";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "").replace(/\/+$/, "");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!base) {
  console.error("使い方: npx tsx scripts/check-urls.ts <新サイトのURL> [--old URL] [--canonical-origin URL] [--expect-noindex | --expect-index]");
  process.exit(2);
}
const OLD = (opt("--old") ?? process.env.WP_URL ?? "https://resilient-cer.com").replace(/\/+$/, "");
const CANONICAL_ORIGIN = (opt("--canonical-origin") ?? OLD).replace(/\/+$/, "");
const EXPECT_NOINDEX = args.includes("--expect-noindex");
const EXPECT_INDEX = args.includes("--expect-index");
const UA = "url-check-bot";

/** 旧サイトの固定ページ(デコード後のパス) → 新サイトでの最終的なパス */
const PAGE_MAP: Record<string, string> = {
  "レジリエンサーcafeとは": "/about/",
  "contact-us": "/contact/",
  "プライバシーポリシー-免責事項": "/privacy-policy/",
  profile: "/profile/",
};

/** 旧サイトのその他のURL → 新サイトで転送される先(最終的なパス+クエリ)。 */
const LEGACY_REDIRECTS: [string, string][] = [
  ["/sitemap.html", "/"],
  ["/page/2/", "/?page=2"],
  ["/category/job-change/page/2/", "/category/job-change/?page=2"],
  ["/2024/06/", "/archive/2024/06/"],
  ["/articles/what-is-ai/", "/what-is-ai/"],
  ["/what-is-ai/feed/", "/what-is-ai/"],
];

const MUST_BE_OK = ["/", "/profile/", "/contact/", "/about/", "/privacy-policy/", "/category/job-change/", "/feed/", "/sitemap.xml", "/robots.txt", "/archive/2024/06/", "/search/?q=AI"];

let failures = 0;
const fail = (message: string) => {
  failures++;
  console.log(`  ✗ ${message}`);
};

async function get(url: string, tries = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA } });
      if (res.status >= 500 && attempt < tries) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      return res;
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 転送のLocation(絶対・相対どちらでも)を、パス+クエリの形にそろえる。 */
function pathAndQuery(location: string | null): string {
  if (!location) return "";
  const url = new URL(location, base);
  return url.pathname + url.search;
}

async function collectOldUrls(kind: "post" | "page"): Promise<string[]> {
  const index = await (await get(`${OLD}/sitemap.xml`)).text();
  const subs = [...index.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).filter((u) => u.includes(`${kind}-sitemap`));
  const urls: string[] = [];
  for (const sub of subs) urls.push(...[...(await (await get(sub)).text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
  return urls;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

async function main() {
  console.log(`新サイト: ${base}\n現行サイト: ${OLD}\n期待するcanonicalのオリジン: ${CANONICAL_ORIGIN}\n`);

  const [posts, pages] = await Promise.all([collectOldUrls("post"), collectOldUrls("page")]);

  // ① 記事: 現行と同じパスで開く
  console.log(`① 記事 ${posts.length} 件(現行と同じパスで200・canonical一致・構造化データ・タイトル形式)`);
  let postOk = 0;
  await mapLimit(posts, 4, async (url) => {
    const path = url.replace(OLD, "");
    const expectedCanonical = `${CANONICAL_ORIGIN}${path}`;
    const res = await get(base + path);
    const html = res.status === 200 ? await res.text() : "";
    const problems: string[] = [];
    if (res.status !== 200) problems.push(`HTTP ${res.status}${res.headers.get("location") ? " → " + res.headers.get("location") : ""}`);
    else {
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (canonical !== expectedCanonical) problems.push(`canonicalが違う: ${canonical ?? "なし"}`);
      if (!html.includes("application/ld+json")) problems.push("構造化データ(JSON-LD)がない");
      if (!/<title>[^<]+ \| レジリエンサーCafe<\/title>/.test(html)) problems.push("タイトルの形式が違う");
    }
    if (problems.length === 0) postOk++;
    else fail(`${decode(path)}: ${problems.join(" / ")}`);
  });
  console.log(`  → 合格 ${postOk} / ${posts.length}\n`);

  // ② 固定ページ・その他の転送
  console.log("② 固定ページ・転送");
  for (const url of pages) {
    const path = url.replace(OLD, "");
    const key = decode(path).replace(/^\/|\/$/g, "").toLowerCase();
    const expected = PAGE_MAP[key];
    if (!expected) {
      fail(`${decode(path)}: 新サイトでの移動先が未定義(scripts/check-urls.ts の PAGE_MAP に追加してください)`);
      continue;
    }
    const res = await get(base + path);
    // 200(同じURLで開く) か、期待する先への転送(1回)であること
    if (res.status === 200 && pathAndQuery(path) === expected) continue;
    if ([301, 308].includes(res.status) && pathAndQuery(res.headers.get("location")) === expected) continue;
    fail(`${decode(path)}: HTTP ${res.status} → ${res.headers.get("location") ?? "(転送なし)"} (期待: ${expected})`);
  }
  for (const [from, to] of LEGACY_REDIRECTS) {
    const res = await get(base + from);
    const got = pathAndQuery(res.headers.get("location"));
    if (![301, 308].includes(res.status) || got !== to) fail(`${from}: HTTP ${res.status} → ${got || "(転送なし)"} (期待: ${to})`);
  }
  {
    const res = await get(`${base}/wp-content/uploads/2024/06/avatar-150x150.png`);
    const loc = res.headers.get("location") ?? "";
    if (![301, 308].includes(res.status) || !loc.includes("media.resilient-cer.com/2024/06/avatar-150x150.png")) {
      fail(`/wp-content/uploads/...: HTTP ${res.status} → ${loc || "(転送なし)"}`);
    }
  }
  console.log(failures === 0 ? "  → すべて合格\n" : "");

  // ③ 主要ページ・サイトマップ
  console.log("③ 主要ページ・サイトマップ");
  for (const path of MUST_BE_OK) {
    const res = await get(base + path);
    if (res.status !== 200) fail(`${path}: HTTP ${res.status}`);
  }
  const smRes = await get(`${base}/sitemap.xml`);
  const smUrls = smRes.status === 200 ? [...(await smRes.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
  const smSet = new Set(smUrls);
  const missing = posts.map((u) => u.replace(OLD, CANONICAL_ORIGIN)).filter((u) => !smSet.has(u));
  if (missing.length) fail(`サイトマップに無い現行の記事URL: ${missing.length} 件 (例: ${decode(missing[0])})`);
  const noSlash = smUrls.filter((u) => !u.endsWith("/"));
  if (noSlash.length) fail(`サイトマップに末尾「/」なしのURLがある: ${noSlash.length} 件 (例: ${noSlash[0]})`);
  const local = smUrls.filter((u) => /localhost|127\.0\.0\.1/.test(u));
  if (local.length) fail(`サイトマップが localhost を指している: ${local.length} 件(NEXT_PUBLIC_SITE_URL を確認)`);
  console.log(`  サイトマップ: ${smUrls.length} 件\n`);

  // ④ 検索エンジンへの公開状態
  const top = await get(`${base}/`);
  const robots = top.headers.get("x-robots-tag") ?? "";
  console.log(`④ トップの X-Robots-Tag: ${robots || "(なし = インデックス可)"}`);
  if (EXPECT_NOINDEX && !/noindex/i.test(robots)) fail("noindex が付いていません(仮のデプロイ先では付いているべきです)");
  if (EXPECT_INDEX && /noindex/i.test(robots)) fail("noindex が付いています(本番では付いていてはいけません。NEXT_PUBLIC_SITE_URL と、アクセスしているドメインを確認)");

  console.log(failures === 0 ? "\n✅ すべて合格しました。" : `\n❌ 失敗 ${failures} 件(上の ✗ を確認してください)。`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
