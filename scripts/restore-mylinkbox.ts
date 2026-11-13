/**
 * WordPress移行で本文から消えた、バリューコマース「MyLinkBox」(商品リンクのウィジェット)を、元の位置に戻す。
 *
 * 旧WordPressの記事には、カスタムHTMLブロック <div data-vc_mylinkbox_id="123"></div> が置かれていた
 * (サイト共通の mylinkbox.js が商品カードに差し替える)。移行時のHTML→Markdown変換で、このブロックは本文から
 * 落ちていた。ここでは、ダンプ(scripts/data/wp-export.sql)の各ブロックの「直前の見出し」を手がかりに、
 * 新しい本文の同じ見出しの直後へ、独立した1行 [vc-mylinkbox id="123"] を差し込む(記法は src/lib/myLinkBox.ts)。
 * 見出しが1つに決まらないものは書き換えず、一覧に出して中止する。
 *
 *   npx tsx scripts/restore-mylinkbox.ts            # 確認のみ(DBは変更しない)
 *   npx tsx scripts/restore-mylinkbox.ts --apply    # 元の本文を scripts/data に退避してから書き換える
 *
 * 何度実行しても重複しない(同じIDが既に本文にあれば、そのブロックは飛ばす)。
 * 公開日(publishedAt)・更新日(updatedAt)は変更しない。公開ページのキャッシュは --apply の最後に再生成を依頼する。
 * 書き換えた後は、管理画面の「全記事を再スキャン」(または scripts/sync-affiliate-links.ts --apply)で
 * アフィリエイト管理に反映する。
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractTableRows } from "./lib/sql-dump";
import { signRevalidateBody } from "../src/lib/ai/jobs/token";
import { findMyLinkBoxes, myLinkBoxShortcode } from "../src/lib/myLinkBox";
import { extractAffiliateLinks } from "../src/lib/affiliateLinks";

const APPLY = process.argv.includes("--apply");
const SQL_FILE_PATH = process.env.WP_SQL_FILE ?? "scripts/data/wp-export.sql";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

interface WpWidget {
  id: string;
  /** 直前の見出し(タグ・HTMLエンティティを除いた文字列) */
  heading: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** 見出しの比較用: 空白・Markdownのエスケープを無視する。 */
function normalize(text: string): string {
  return decodeEntities(text)
    .replace(/\\(.)/g, "$1")
    .replace(/[\s *_`]/g, "");
}

function extractWpWidgets(content: string): WpWidget[] {
  const widgets: WpWidget[] = [];
  for (const match of content.matchAll(/data-vc_mylinkbox_id="(\d+)"/g)) {
    const before = content.slice(0, match.index);
    const headings = [...before.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)];
    const raw = headings.at(-1)?.[1] ?? "";
    widgets.push({ id: match[1], heading: decodeEntities(raw.replace(/<[^>]*>/g, "")).trim() });
  }
  return widgets;
}

async function main() {
  console.log(APPLY ? "== 実行モード(DBを書き換えます) ==" : "== 確認モード(DBは変更しません) ==");

  const sql = fs.readFileSync(path.resolve(SQL_FILE_PATH), "utf-8");
  const widgetsByWpId = new Map<number, WpWidget[]>();
  for (const post of extractTableRows(sql, "wp_posts")) {
    if (post.post_type !== "post") continue;
    const widgets = extractWpWidgets(String(post.post_content ?? ""));
    if (widgets.length > 0) widgetsByWpId.set(Number(post.ID), widgets);
  }
  console.log(`ダンプでMyLinkBoxを使っている投稿: ${widgetsByWpId.size} 件(下書き・ゴミ箱を含む)`);

  const articles = await prisma.article.findMany({
    where: { wpId: { in: [...widgetsByWpId.keys()] } },
    select: { id: true, slug: true, title: true, status: true, wpId: true, contentMarkdown: true, updatedAt: true },
  });

  const changes: { id: string; slug: string; before: string; after: string; updatedAt: Date }[] = [];
  const unresolved: string[] = [];

  for (const article of articles) {
    const widgets = widgetsByWpId.get(article.wpId!)!;
    const existingIds = new Set(findMyLinkBoxes(article.contentMarkdown).map((box) => box.id));
    const lines = article.contentMarkdown.split("\n");
    console.log(`\n[${article.status}] ${article.title}  (${article.slug}, wp=${article.wpId}) ウィジェット ${widgets.length} 個`);

    // 同じ見出しの下に複数あるときは、元の順序で並べる
    const insertAfter = new Map<number, string[]>();
    for (const widget of widgets) {
      if (existingIds.has(widget.id)) {
        console.log(`  - ${widget.id}: 既に本文にあります(飛ばします)`);
        continue;
      }
      const wanted = normalize(widget.heading);
      // 見出しが <br> の変換で2行に分かれている記事がある(次の行に、見出しの続きが段落として残る)ため、
      // 見出し1行だけで一致しなければ、次の行と連結した形でも照合する。その場合は、続きの行の直後に挿入する。
      const candidates = lines.flatMap((line, index) => {
        if (!/^#{1,6}[ \t]+\S/.test(line) || wanted === "") return [];
        const title = normalize(line.replace(/^#{1,6}[ \t]+/, ""));
        if (title === wanted) return [{ index }];
        if (title + normalize(lines[index + 1] ?? "") === wanted) return [{ index: index + 1 }];
        return [];
      });
      if (candidates.length !== 1) {
        unresolved.push(`${article.slug}: ${widget.id} 見出し「${widget.heading}」に一致する行が ${candidates.length} 件`);
        console.log(`  - ${widget.id}: ⚠ 位置を決められません(見出し「${widget.heading}」に一致 ${candidates.length} 件)`);
        continue;
      }
      const { index } = candidates[0];
      insertAfter.set(index, [...(insertAfter.get(index) ?? []), myLinkBoxShortcode(widget.id)]);
      console.log(`  - ${widget.id}: 「${widget.heading.slice(0, 40)}」の見出しの直後(${index + 1}行目)に挿入`);
    }

    if (insertAfter.size === 0) continue;
    const out: string[] = [];
    lines.forEach((line, index) => {
      out.push(line);
      const boxes = insertAfter.get(index);
      if (boxes) {
        // 見出しの直後に、空行で挟んだ独立した行として置く(段落として解釈され、描画側が商品リンクの置き場所にする)
        out.push("", ...boxes.flatMap((box) => [box, ""]));
        if (lines[index + 1]?.trim() === "") out.pop(); // 元の次の行が空行なら、重ねない
      }
    });
    changes.push({ id: article.id, slug: article.slug, before: article.contentMarkdown, after: out.join("\n"), updatedAt: article.updatedAt });
  }

  const missing = [...widgetsByWpId.keys()].filter((wpId) => !articles.some((a) => a.wpId === wpId));
  if (missing.length > 0) console.log(`\n新サイトに対応する記事がない投稿(WordPress ID): ${missing.join(", ")} … 下書き・ゴミ箱のものは、対象外です`);

  console.log(`\n対象 ${changes.length} 記事 / 挿入 ${changes.reduce((n, c) => n + findMyLinkBoxes(c.after).length - findMyLinkBoxes(c.before).length, 0)} 個`);
  if (unresolved.length > 0) {
    console.error("\n位置を決められなかったもの(この部分は書き換えません):");
    for (const u of unresolved) console.error("  - " + u);
  }

  if (!APPLY) {
    for (const c of changes) {
      const idx = c.after.indexOf("[vc-mylinkbox");
      console.log(`\n--- ${c.slug} の挿入例 ---\n${c.after.slice(Math.max(0, idx - 120), idx + 160)}`);
      // 復元後に、アフィリエイト管理(src/lib/affiliateLinks.ts)がどう検出するか
      const detected = extractAffiliateLinks(c.after).filter((link) => link.kind === "widget");
      console.log(`--- 復元後の検出: ウィジェット ${detected.length} 個 / ${detected.map((d) => d.anchorText.slice(0, 18)).join(" , ")}`);
    }
    console.log("\n確認のみです。問題がなければ --apply を付けて実行してください。");
    return;
  }
  if (unresolved.length > 0) {
    console.error("\n中止: 位置を決められないものがあります。");
    process.exitCode = 1;
    return;
  }
  if (changes.length === 0) {
    console.log("書き換える記事はありません。");
    return;
  }

  // 元の本文を退避してから書き換える(戻すときは、このファイルの contentMarkdown を書き戻す)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(`scripts/data/mylinkbox-backup-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(changes.map(({ id, slug, before, updatedAt }) => ({ id, slug, updatedAt, contentMarkdown: before })), null, 1)
  );
  console.log(`\n元の本文を退避しました: ${backupPath}`);

  // updatedAt を、元の値のまま明示する(@updatedAt は、指定しなければ現在時刻になる)。publishedAt には触れない。
  for (const c of changes) {
    await prisma.article.update({ where: { id: c.id }, data: { contentMarkdown: c.after, updatedAt: c.updatedAt } });
  }
  console.log(`完了: ${changes.length} 件の本文を書き換えました。`);

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
