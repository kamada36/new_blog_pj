import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { aspLabel } from "@/lib/affiliateLinks";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { deleteAffiliateProgram, rescanAffiliateLinks, updateAffiliateProgram } from "./actions";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  published: { label: "公開中", className: "bg-accent-soft text-accent-dark" },
  private: { label: "非公開", className: "bg-red-50 text-red-600" },
  draft: { label: "下書き", className: "bg-surface-muted text-foreground-muted" },
};

const FILTERS = [
  { key: "has", label: "リンクあり" },
  { key: "none", label: "リンクなし" },
  { key: "all", label: "すべて" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function isFilterKey(value: string): value is FilterKey {
  return FILTERS.some((filter) => filter.key === value);
}

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES.draft;
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>;
}

const KIND_LABELS: Record<string, string> = { text: "文字", banner: "バナー", widget: "ウィジェット" };

function kindLabel(kind: string) {
  return KIND_LABELS[kind] ?? kind;
}

export default async function AdminAffiliatesPage({ searchParams }: PageProps<"/admin/affiliates">) {
  const params = await searchParams;
  const param = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const notice = param("notice");
  const error = param("error");
  const q = param("q").trim();
  const filter: FilterKey = isFilterKey(param("filter")) ? (param("filter") as FilterKey) : "has";

  const articleWhere: Prisma.ArticleWhereInput = {
    ...(filter !== "all" ? { affiliateStatus: filter } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };

  const [programs, articles, totalArticles, linkedArticles, invisibleLinks] = await Promise.all([
    prisma.affiliateProgram.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        links: {
          select: {
            kind: true,
            occurrences: true,
            article: { select: { id: true, title: true, status: true } },
          },
        },
      },
    }),
    prisma.article.findMany({
      where: articleWhere,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        affiliateStatus: true,
        affiliateLinks: {
          orderBy: [{ program: { name: "asc" } }, { kind: "asc" }],
          select: {
            id: true,
            url: true,
            kind: true,
            anchorText: true,
            occurrences: true,
            program: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.article.count(),
    prisma.article.count({ where: { affiliateStatus: "has" } }),
    prisma.articleAffiliateLink.count({ where: { kind: "text", anchorText: "" } }),
  ]);

  // サービスごとに、使っている記事を集める
  const programRows = programs
    .map((program) => {
      const byArticle = new Map<
        string,
        { id: string; title: string; status: string; text: number; banner: number; widget: number }
      >();
      for (const link of program.links) {
        const entry = byArticle.get(link.article.id) ?? { ...link.article, text: 0, banner: 0, widget: 0 };
        entry[link.kind === "banner" ? "banner" : link.kind === "widget" ? "widget" : "text"] += 1;
        byArticle.set(link.article.id, entry);
      }
      return { program, articles: [...byArticle.values()] };
    })
    .sort((a, b) => b.articles.length - a.articles.length || a.program.name.localeCompare(b.program.name, "ja"));

  const totalLinks = programs.reduce((sum, program) => sum + program.links.length, 0);

  const inputClass = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-black">アフィリエイト管理</h1>
        <form action={rescanAffiliateLinks}>
          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
          >
            全記事を再スキャン
          </button>
        </form>
      </div>
      <p className="mt-2 text-sm text-foreground-muted">
        記事本文の中にあるアフィリエイトリンク(A8.net など、ASPの計測URL)を自動で検出して、どの記事でどのサービスを紹介しているかをまとめています。
        記事間の内部リンクや参考サイトへの普通のリンクは含みません。サイドバー・フッターのスポンサー枠は
        <Link href="/admin/settings" className="text-accent-dark hover:underline">
          サイト設定
        </Link>
        で管理します。記事を保存するたびに自動で更新されます。
      </p>

      {notice && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-dark">{notice}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "リンクあり記事", value: linkedArticles },
          { label: "リンクなし記事", value: totalArticles - linkedArticles },
          { label: "サービス", value: programs.length },
          { label: "リンク(重複除く)", value: totalLinks },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <dt className="text-xs font-semibold text-foreground-muted">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-black">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 font-display text-lg font-black">サービス別</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        サービス名は仮の名前です。自由に付け替えられます。同じサービスでも提携(プログラム)が別のものは、別々のサービスとして分けて管理します。
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {programRows.map(({ program, articles: usedIn }) => (
          <section key={program.id} className="rounded-2xl border border-border bg-surface p-4">
            <form action={updateAffiliateProgram.bind(null, program.id)} className="flex flex-wrap items-center gap-3">
              <input name="name" defaultValue={program.name} required maxLength={100} className={`w-64 ${inputClass}`} />
              <input
                name="memo"
                defaultValue={program.memo}
                maxLength={500}
                placeholder="メモ(提携条件・単価・有効期限など)"
                className={`min-w-[200px] flex-1 ${inputClass}`}
              />
              <button type="submit" className="text-sm font-semibold text-accent-dark hover:underline">
                保存
              </button>
            </form>
            <p className="mt-2 text-xs text-foreground-muted">
              {aspLabel(program.asp)} / {usedIn.length}記事・{program.links.length}リンク / 識別子:{" "}
              {program.keys.map((key) => (
                <code key={key} className="mr-1 rounded bg-surface-muted px-1 py-0.5">
                  {key}
                </code>
              ))}
            </p>

            {usedIn.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {usedIn.map((article) => (
                  <li key={article.id} className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={article.status} />
                    <Link href={`/admin/articles/${article.id}`} className="hover:text-accent-dark hover:underline">
                      {article.title}
                    </Link>
                    <span className="text-xs text-foreground-muted">
                      {[
                        article.text > 0 && `文字×${article.text}`,
                        article.banner > 0 && `バナー×${article.banner}`,
                        article.widget > 0 && `ウィジェット×${article.widget}`,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-foreground-muted">このサービスを使っている記事はありません。</p>
            )}

            {program.links.length === 0 && (
              <form action={deleteAffiliateProgram.bind(null, program.id)} className="mt-3 border-t border-border pt-3">
                <ConfirmSubmitButton
                  confirmMessage="このサービスを削除します。よろしいですか？"
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  削除
                </ConfirmSubmitButton>
              </form>
            )}
          </section>
        ))}
        {programRows.length === 0 && (
          <p className="text-sm text-foreground-muted">
            まだ登録がありません。「全記事を再スキャン」で、現在の記事から取り込めます。
          </p>
        )}
      </div>

      <h2 className="mt-10 font-display text-lg font-black">記事別</h2>
      <form method="GET" className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-full border border-border bg-surface p-1 text-sm">
          {FILTERS.map((item) => (
            <Link
              key={item.key}
              href={`/admin/affiliates?filter=${item.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-full px-3 py-1 font-semibold ${
                filter === item.key ? "bg-accent text-accent-contrast" : "text-foreground-muted hover:text-accent-dark"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <input type="hidden" name="filter" value={filter} />
        <input type="text" name="q" defaultValue={q} placeholder="タイトルで検索" className={`min-w-[180px] ${inputClass}`} />
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-dark"
        >
          絞り込む
        </button>
      </form>
      {invisibleLinks > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          表示テキストが空のリンク(読者には見えないリンク)が{invisibleLinks}件あります。「⚠」の付いた行を確認してください。
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border bg-surface-muted text-left text-xs font-semibold text-foreground-muted">
            <tr>
              <th className="px-4 py-3">タイトル</th>
              <th className="px-4 py-3">状態</th>
              <th className="px-4 py-3">アフィリエイト</th>
              <th className="px-4 py-3">使っているリンク</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => {
              const serviceNames = [...new Set(article.affiliateLinks.map((link) => link.program.name))];
              return (
                <tr key={article.id} className="border-b border-border align-top last:border-0">
                  <td className="max-w-xs px-4 py-3 font-medium">
                    <Link href={`/admin/articles/${article.id}`} className="hover:text-accent-dark hover:underline">
                      {article.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={article.status} />
                  </td>
                  <td className="px-4 py-3">
                    {article.affiliateStatus === "has" ? (
                      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-dark">
                        あり
                      </span>
                    ) : (
                      <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-foreground-muted">
                        なし
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {article.affiliateLinks.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-accent-dark">
                          {serviceNames.join(" / ")}({article.affiliateLinks.length}リンク)
                        </summary>
                        <ul className="mt-2 flex flex-col gap-2">
                          {article.affiliateLinks.map((link) => (
                            <li key={link.id} className="text-xs">
                              <span className="font-semibold">{link.program.name}</span>{" "}
                              <span className="rounded bg-surface-muted px-1 py-0.5">{kindLabel(link.kind)}</span>
                              {link.occurrences > 1 && <span className="text-foreground-muted"> ×{link.occurrences}</span>}
                              {link.kind === "text" && !link.anchorText ? (
                                <span className="ml-1 text-amber-700">⚠ 表示テキストなし</span>
                              ) : (
                                link.anchorText && <span className="ml-1 text-foreground-muted">{link.anchorText}</span>
                              )}
                              {/* 自分でクリックして成果計測を汚さないよう、リンクにはせず文字だけ表示する */}
                              <code className="mt-0.5 block break-all text-foreground-muted">{link.url}</code>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <span className="text-foreground-muted">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {articles.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-foreground-muted">条件に一致する記事がありません。</p>
        )}
      </div>
    </div>
  );
}
