/**
 * 記事本文のアフィリエイトリンクを抽出して、管理画面(/admin/affiliates)用のテーブルへ取り込む。
 * 記事間の内部リンクや参考サイトへの普通のリンクは対象外で、ASPの計測URL(A8の px.a8.net など)だけを拾う。
 * 検出ルールは src/lib/affiliateLinks.ts の ASP_RULES。
 *
 *   npx tsx scripts/sync-affiliate-links.ts            # 確認のみ(DBは変更しない。マイグレーション前でも動く)
 *   npx tsx scripts/sync-affiliate-links.ts --apply    # AffiliateProgram / ArticleAffiliateLink / Article.affiliateStatus を更新
 *
 * 先に `npx prisma migrate deploy` でテーブルを作っておくこと(--apply のとき)。
 * 記事の本文・更新日(updatedAt)は変更しない。何度実行しても同じ結果になる(リンク情報は作り直し)。
 * 管理画面の「再スキャン」ボタンも同じ処理。
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { aspLabel, extractAffiliateLinks, suggestProgramName } from "../src/lib/affiliateLinks";
import { syncAllArticleAffiliateLinks } from "../src/lib/affiliateStore";

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  console.log(APPLY ? "== 実行モード(DBを書き換えます) ==" : "== 確認モード(DBは変更しません) ==");

  const articles = await prisma.article.findMany({
    select: { slug: true, title: true, status: true, contentMarkdown: true },
    orderBy: { createdAt: "asc" },
  });

  const byProgram = new Map<string, { asp: string; anchors: string[]; articles: Set<string>; links: number }>();
  let withLinks = 0;
  let invisible = 0;

  for (const article of articles) {
    const links = extractAffiliateLinks(article.contentMarkdown);
    if (links.length === 0) continue;
    withLinks++;

    const count = (kind: string) => links.filter((l) => l.kind === kind).length;
    console.log(
      `\n[${article.status}] ${article.title}\n  文字リンク ${count("text")} / バナー ${count("banner")} / ウィジェット ${count("widget")}`
    );
    for (const link of links) {
      const missing = link.kind === "text" && !link.anchorText;
      if (missing) invisible++;
      console.log(
        `  - ${{ text: "文字  ", banner: "バナー", widget: "ウィジェ" }[link.kind]} ×${link.occurrences}  ${link.programKey}  ${
          missing ? "⚠ アンカーテキストなし" : link.anchorText.slice(0, 50)
        }`
      );

      const entry = byProgram.get(link.programKey) ?? { asp: link.asp, anchors: [], articles: new Set(), links: 0 };
      entry.anchors.push(link.anchorText);
      entry.articles.add(article.slug);
      entry.links++;
      byProgram.set(link.programKey, entry);
    }
  }

  console.log("\n== サービス(識別子)ごと ==");
  for (const [key, entry] of [...byProgram.entries()].sort((a, b) => b[1].articles.size - a[1].articles.size)) {
    console.log(
      `  ${key}  [${aspLabel(entry.asp)}]  仮の名前: ${suggestProgramName(entry.anchors, entry.asp, key)}  / ${entry.articles.size}記事 ${entry.links}リンク`
    );
  }
  console.log(
    `\n記事 ${articles.length} 件のうち、アフィリエイトリンクあり ${withLinks} 件 / なし ${articles.length - withLinks} 件` +
      ` / サービス ${byProgram.size} 件 / アンカーテキストなしのリンク ${invisible} 件`
  );

  if (!APPLY) {
    console.log("\n確認のみです。問題がなければ --apply を付けて実行してください。");
    return;
  }

  const summary = await syncAllArticleAffiliateLinks(prisma);
  console.log(
    `\n完了: 記事 ${summary.articles} 件を走査し、リンクあり ${summary.articlesWithLinks} 件 / リンク ${summary.links} 件を登録しました` +
      `(新しく作ったサービス ${summary.programsCreated} 件)。`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
