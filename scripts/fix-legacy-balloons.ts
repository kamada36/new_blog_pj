/**
 * WordPress移行時の変換で「ただの引用」になってしまった古い吹き出しを、新しい記事と同じ吹き出し表示に直す。
 *
 * 移行スクリプト(scripts/lib/cocoon-blocks.ts)は、Cocoonの吹き出しブロックを
 *   > ![](アイコンURL)
 *   >
 *   > 台詞
 * という引用に変換し、左右の位置情報を捨てていた。本文の表示側(ArticleBody)は、アイコン画像の alt が
 * "sc-balloon-l" / "sc-balloon-r" の引用だけを吹き出しとして描画するため、古い記事だけ灰色の囲みで表示されていた。
 * ここでは alt に目印を付けて(`> ![sc-balloon-r](URL)`)、新しい記事([sc name=...] が展開された形)と同じ描画にする。
 * 台詞の文章・太字・リンクには触れない。
 *
 * 左右は、元のWordPressのダンプ(scripts/data/wp-export.sql)にある吹き出しブロックの位置(sbp-l / sbp-r)を、
 * 記事ごとに登場順で突き合わせて決める。突き合わせられないものだけ、ダンプ全体でのアイコンごとの多数派を使う。
 *
 *   npx tsx scripts/fix-legacy-balloons.ts            # 確認のみ(DBは変更しない)
 *   npx tsx scripts/fix-legacy-balloons.ts --apply    # 元の本文を scripts/data に退避してから書き換える
 *
 * 公開日(publishedAt)・更新日(updatedAt)は変更しない(一覧の並び順と「最新記事」扱いを保つ)。
 * 「最終更新日」の行も入れない。公開ページのキャッシュは、--apply の最後に再生成を依頼する。
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractTableRows } from "./lib/sql-dump";
import { signRevalidateBody } from "../src/lib/ai/jobs/token";

const APPLY = process.argv.includes("--apply");
const SQL_FILE_PATH = process.env.WP_SQL_FILE ?? "scripts/data/wp-export.sql";
const BALLOON_ALT_PREFIX = "sc-balloon-"; // src/lib/shortcodes.ts の BALLOON_ICON_ALT_PREFIX と同じ

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Pos = "l" | "r";
type WpBalloon = { file: string; pos: Pos };

/** URLからアイコンの識別子(フォルダや -150x150.png の違いを無視した、ファイル名の本体)を取り出す。 */
function iconKey(url: string): string {
  const name = decodeURIComponent(url.split("?")[0].split("/").pop() ?? url);
  return name.replace(/\.(png|jpe?g|webp|gif)$/i, "").replace(/-150x150$/, "");
}

/** WordPressの記事本文から、Cocoon吹き出しブロックの(アイコン, 左右)を登場順に取り出す。 */
function extractWpBalloons(content: string): WpBalloon[] {
  const result: WpBalloon[] = [];
  const re = /<div class="([^"]*\bcocoon-block-balloon\b[^"]*)"/g;
  for (let m = re.exec(content); m; m = re.exec(content)) {
    const pos = /\bsbp-([lr])\b/.exec(m[1])?.[1] as Pos | undefined;
    // アイコンは、このブロックの中の最初の画像(次のブロックに入り込まないよう、ブロックの範囲だけを見る)
    const rest = content.slice(m.index);
    const end = rest.indexOf("<!-- /wp:cocoon-blocks/balloon-ex-box-1 -->");
    const block = end >= 0 ? rest.slice(0, end) : rest.slice(0, 1500);
    const src = /<img[^>]*\bsrc="([^"]+)"/.exec(block)?.[1];
    if (pos && src) result.push({ file: iconKey(src), pos });
  }
  return result;
}

interface Legacy {
  line: number;
  file: string;
  /** アイコン行の直後が、空の引用行を挟まずに本文へ続いている(画像と台詞が1段落になり、吹き出しと認識されない) */
  needsSeparator: boolean;
}

/** 「> ![](URL)」で始まる(直前が引用の続きでない)アイコン行を探す。 */
function findLegacyBalloons(lines: string[]): Legacy[] {
  const found: Legacy[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^>[ \t]*!\[\]\((https?:\/\/[^)\s]+-150x150\.png)\)[ \t]*\r?$/.exec(lines[i]);
    if (!m) continue;
    if (i > 0 && /^>/.test(lines[i - 1])) continue; // 引用の途中にある画像は、吹き出しのアイコンではない
    const next = lines[i + 1];
    found.push({ line: i, file: iconKey(m[1]), needsSeparator: next !== undefined && /^>/.test(next) && !/^>[ \t]*\r?$/.test(next) });
  }
  return found;
}

async function main() {
  console.log(APPLY ? "== 実行モード(DBを書き換えます) ==" : "== 確認モード(DBは変更しません) ==");

  console.log("WordPressのダンプから、吹き出しの左右を読み込みます...");
  const sql = fs.readFileSync(path.resolve(SQL_FILE_PATH), "utf-8");
  const wpBalloonsByPost = new Map<number, WpBalloon[]>();
  const tally = new Map<string, { l: number; r: number }>();
  for (const post of extractTableRows(sql, "wp_posts")) {
    if (post.post_type !== "post") continue;
    const balloons = extractWpBalloons(String(post.post_content ?? ""));
    wpBalloonsByPost.set(Number(post.ID), balloons);
    for (const b of balloons) {
      const t = tally.get(b.file) ?? { l: 0, r: 0 };
      t[b.pos]++;
      tally.set(b.file, t);
    }
  }
  const majority = (file: string): Pos | null => {
    const t = tally.get(file);
    if (!t || t.l === t.r) return null;
    return t.l > t.r ? "l" : "r";
  };

  const [articles, pages] = await Promise.all([
    prisma.article.findMany({ select: { id: true, slug: true, title: true, status: true, wpId: true, contentMarkdown: true, updatedAt: true } }),
    prisma.page.findMany({ select: { id: true, slug: true, title: true, contentMarkdown: true, updatedAt: true } }),
  ]);
  const targets = [
    ...articles.map((a) => ({ kind: "article" as const, ...a, status: a.status as string })),
    ...pages.map((p) => ({ kind: "page" as const, ...p, wpId: null, status: "-" })),
  ];

  const changes: { kind: "article" | "page"; id: string; slug: string; before: string; after: string; updatedAt: Date }[] = [];
  const unresolved: string[] = [];
  const stats = { balloons: 0, sequence: 0, anywhere: 0, majority: 0, unresolved: 0, separators: 0 };

  for (const t of targets) {
    const lines = t.contentMarkdown.split("\n");
    const legacy = findLegacyBalloons(lines);
    if (legacy.length === 0) continue;

    const wp = (t.wpId !== null ? wpBalloonsByPost.get(t.wpId) : undefined) ?? [];
    let cursor = 0;
    const out = [...lines];
    const posList: string[] = [];
    // 後ろの行から書き換えると、区切り行を挿入しても前の行番号がずれない
    const decided: { item: Legacy; pos: Pos | null; how: string }[] = [];
    for (const item of legacy) {
      let pos: Pos | null = null;
      let how = "";
      const j = wp.findIndex((b, idx) => idx >= cursor && b.file === item.file);
      if (j >= 0) {
        pos = wp[j].pos;
        cursor = j + 1;
        how = "sequence";
      } else {
        const k = wp.findIndex((b) => b.file === item.file);
        if (k >= 0) {
          pos = wp[k].pos;
          how = "anywhere";
        } else {
          pos = majority(item.file);
          how = "majority";
        }
      }
      decided.push({ item, pos, how });
    }

    for (const d of decided.slice().reverse()) {
      stats.balloons++;
      if (!d.pos) {
        stats.unresolved++;
        unresolved.push(`${t.slug} 行${d.item.line + 1}: ${d.item.file}`);
        continue;
      }
      stats[d.how as "sequence" | "anywhere" | "majority"]++;
      const eol = out[d.item.line].endsWith("\r") ? "\r" : "";
      out[d.item.line] = out[d.item.line].replace("![](", `![${BALLOON_ALT_PREFIX}${d.pos}](`);
      if (d.item.needsSeparator) {
        out.splice(d.item.line + 1, 0, `>${eol}`);
        stats.separators++;
      }
    }
    for (const d of decided) posList.push(`${d.pos ?? "?"}${d.how === "sequence" ? "" : `(${d.how})`}`);

    const after = out.join("\n");
    if (after !== t.contentMarkdown) {
      changes.push({ kind: t.kind, id: t.id, slug: t.slug, before: t.contentMarkdown, after, updatedAt: t.updatedAt });
    }
    console.log(`  [${t.kind}/${t.status}] ${t.slug}  wp=${t.wpId ?? "-"}  ${legacy.length}件: ${posList.join(" ")}`);
  }

  console.log(
    `\n対象 ${changes.length} 件(記事 ${changes.filter((c) => c.kind === "article").length} / 固定ページ ${changes.filter((c) => c.kind === "page").length})` +
      ` / 吹き出し ${stats.balloons} 個`
  );
  console.log(
    `左右の決定: 登場順の突き合わせ ${stats.sequence} / 同じ記事内で同じアイコン ${stats.anywhere} / ダンプ全体の多数派 ${stats.majority} / 決められない ${stats.unresolved}`
  );
  console.log(`画像と台詞の間に区切りの空引用行を足した箇所: ${stats.separators}`);
  if (unresolved.length > 0) {
    console.error("\n左右を決められなかった吹き出し(この部分は書き換えません):");
    for (const u of unresolved) console.error("  - " + u);
  }

  if (!APPLY) {
    console.log("\n確認のみです。問題がなければ --apply を付けて実行してください。");
    return;
  }
  if (unresolved.length > 0) {
    console.error("\n中止: 左右を決められない吹き出しがあります。");
    process.exitCode = 1;
    return;
  }

  // 元の本文を退避してから書き換える(戻すときは、このファイルの before を書き戻す)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(`scripts/data/legacy-balloons-backup-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(changes.map(({ kind, id, slug, before, updatedAt }) => ({ kind, id, slug, updatedAt, contentMarkdown: before })), null, 1)
  );
  console.log(`\n元の本文を退避しました: ${backupPath}`);

  // updatedAt を、元の値のまま明示する(@updatedAt は、指定しなければ現在時刻になる)。publishedAt には触れない。
  for (let i = 0; i < changes.length; i += 10) {
    await Promise.all(
      changes.slice(i, i + 10).map((c) =>
        c.kind === "article"
          ? prisma.article.update({ where: { id: c.id }, data: { contentMarkdown: c.after, updatedAt: c.updatedAt } })
          : prisma.page.update({ where: { id: c.id }, data: { contentMarkdown: c.after, updatedAt: c.updatedAt } })
      )
    );
    console.log(`  ${Math.min(i + 10, changes.length)}/${changes.length}`);
  }
  console.log(`\n完了: ${changes.length} 件の本文を書き換えました。`);

  // 公開ページのキャッシュ(Next.js・Cloudflare)の再生成を依頼する。失敗しても、1時間以内には自然に反映される。
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    const body = JSON.stringify({ paths: [{ path: "/", type: "layout" }] });
    try {
      const res = await fetch(new URL("/api/revalidate/", site), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-revalidate-signature": signRevalidateBody(body) },
        body,
      });
      console.log(res.ok ? "公開ページの再生成を依頼しました。" : `公開ページの再生成の依頼が失敗しました(HTTP ${res.status})。最長1時間で反映されます。`);
    } catch (e) {
      console.warn("公開ページの再生成の依頼に失敗しました:", (e as Error).message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
