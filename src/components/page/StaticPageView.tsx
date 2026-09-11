import { Container } from "@/components/layout/Container";
import { ArticleBody } from "@/components/article/ArticleBody";

export function StaticPageView({ title, markdown }: { title: string; markdown: string }) {
  return (
    <Container className="max-w-3xl py-12">
      <h1 className="font-display text-2xl font-black">{title}</h1>
      <div className="mt-8">
        <ArticleBody markdown={markdown} />
      </div>
    </Container>
  );
}
