import { prisma } from "@/lib/prisma";
import { ArticleEditorForm } from "../ArticleEditorForm";

export default async function NewArticlePage() {
  const [categories, tags, shortcodes] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.shortcode.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="font-display text-xl font-black">新しい記事</h1>
      <div className="mt-6">
        <ArticleEditorForm categories={categories} tags={tags} shortcodes={shortcodes} />
      </div>
    </div>
  );
}
