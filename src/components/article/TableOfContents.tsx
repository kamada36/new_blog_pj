"use client";

import type { TocItem } from "@/lib/toc";
import { numberHeadings } from "@/lib/toc";
import { useScrollSpy } from "@/hooks/useScrollSpy";

export function TableOfContents({ items }: { items: TocItem[] }) {
  const activeId = useScrollSpy(items.map((item) => item.id));

  if (items.length === 0) return null;

  const numbered = numberHeadings(items);

  return (
    <nav className="rounded-2xl border border-border bg-surface-muted p-5" aria-label="目次">
      <p className="font-display text-sm font-bold">目次</p>
      <ol className="mt-3 flex flex-col gap-2 text-sm">
        {numbered.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id} className={item.level === 3 ? "ml-4" : ""}>
              <a
                href={`#${item.id}`}
                className={`flex gap-2 transition-colors ${isActive ? "font-semibold text-accent-dark" : "hover:text-accent-dark"}`}
              >
                {item.level === 2 && <span className="font-semibold text-accent-dark">{item.number}.</span>}
                <span className="line-clamp-2">{item.text}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
