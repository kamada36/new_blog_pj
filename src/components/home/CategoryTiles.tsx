import Link from "next/link";
import Image from "next/image";
import { IconCompass, IconHeart, IconChip, IconLeaf, IconMug } from "@/components/icons/CafeIcons";

const ICON_BY_SLUG: Record<string, typeof IconMug> = {
  "career-knowhow": IconCompass,
  "working-mindset": IconHeart,
  "it-literacy-ai": IconChip,
  "life-topics": IconLeaf,
};

export function CategoryTiles({
  categories,
}: {
  categories: { id: string; name: string; slug: string; description: string; iconUrl?: string | null }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((category) => {
        const Icon = ICON_BY_SLUG[category.slug] ?? IconMug;
        return (
          <Link
            key={category.id}
            href={`/category/${category.slug}`}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-shadow hover:shadow-lg"
          >
            {category.iconUrl ? (
              <span className="relative h-14 w-14 shrink-0">
                <Image src={category.iconUrl} alt="" fill className="object-contain" unoptimized />
              </span>
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark transition-colors group-hover:bg-accent group-hover:text-accent-contrast">
                <Icon className="h-7 w-7" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-bold">{category.name}</span>
              {category.description && (
                <span className="mt-1 block whitespace-pre-line text-xs leading-relaxed text-foreground-muted">
                  {category.description}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
