import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageEditorForm } from "../PageEditorForm";

export default async function EditStaticPage({ params }: PageProps<"/admin/pages/[id]">) {
  const { id } = await params;
  const page = await prisma.page.findUnique({ where: { id } });
  if (!page) notFound();

  return (
    <div>
      <h1 className="font-display text-xl font-black">固定ページを編集</h1>
      <div className="mt-6">
        <PageEditorForm
          initialValues={{
            id: page.id,
            title: page.title,
            slug: page.slug,
            contentMarkdown: page.contentMarkdown,
            metaTitle: page.metaTitle,
            metaDescription: page.metaDescription,
          }}
        />
      </div>
    </div>
  );
}
