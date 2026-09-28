import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ArticleEditorForm } from "../ArticleEditorForm";

export default async function EditArticlePage({ params }: PageProps<"/admin/articles/[id]">) {
  const { id } = await params;

  const [article, categories, tags] = await Promise.all([
    prisma.article.findUnique({ where: { id }, include: { tags: true } }),
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!article) notFound();

  return (
    <div>
      <h1 className="font-display text-xl font-black">記事を編集</h1>
      <div className="mt-6">
        <ArticleEditorForm
          categories={categories}
          tags={tags}
          initialValues={{
            id: article.id,
            title: article.title,
            slug: article.slug,
            excerpt: article.excerpt,
            contentMarkdown: article.contentMarkdown,
            categoryId: article.categoryId,
            tagIds: article.tags.map((tag) => tag.id),
            status: article.status as "draft" | "published" | "private",
            coverImageUrl: article.coverImageUrl,
            metaTitle: article.metaTitle,
            metaDescription: article.metaDescription,
            metaKeywords: article.metaKeywords,
          }}
        />
      </div>
    </div>
  );
}
