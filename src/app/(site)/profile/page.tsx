import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { ArticleBody } from "@/components/article/ArticleBody";
import { IconMug } from "@/components/icons/CafeIcons";
import { getPrimaryAuthor, getPageBySlug } from "@/lib/queries";

const PROFILE_PAGE_SLUG = "profile";

export async function generateMetadata(): Promise<Metadata> {
  const [author, page] = await Promise.all([getPrimaryAuthor(), getPageBySlug(PROFILE_PAGE_SLUG)]);
  if (!author) return {};
  return {
    title: page?.metaTitle || "プロフィール",
    description: page?.metaDescription || `${author.name}のプロフィールです。`,
  };
}

export default async function ProfilePage() {
  const [author, page] = await Promise.all([getPrimaryAuthor(), getPageBySlug(PROFILE_PAGE_SLUG)]);
  if (!author) notFound();

  return (
    <Container className="max-w-2xl py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        {author.avatarUrl ? (
          <Image
            src={author.avatarUrl}
            alt={author.name}
            width={128}
            height={128}
            className="h-32 w-32 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-accent-soft">
            <IconMug className="h-12 w-12 text-accent-dark" />
          </div>
        )}
        <h1 className="font-display text-2xl font-black">{author.name}</h1>
        <div className="flex gap-3">
          {author.snsX && (
            <a
              href={author.snsX}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark"
            >
              X (Twitter)
            </a>
          )}
          {author.snsThreads && (
            <a
              href={author.snsThreads}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent-dark"
            >
              Threads
            </a>
          )}
        </div>
      </div>

      <div className="mt-10">
        <ArticleBody markdown={page?.contentMarkdown || author.bio} />
      </div>
    </Container>
  );
}
