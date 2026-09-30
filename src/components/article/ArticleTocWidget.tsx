"use client";

import { useEffect, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa6";
import type { TocItem } from "@/lib/toc";
import { numberHeadings } from "@/lib/toc";
import { useScrollSpy } from "@/hooks/useScrollSpy";

export function ArticleTocWidget({ items }: { items: TocItem[] }) {
  const [open, setOpen] = useState(true);
  const activeId = useScrollSpy(items.map((item) => item.id));
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!activeId) return;
    const container = listRef.current;
    const target = itemRefs.current.get(activeId);
    if (!container || !target) return;
    // Scroll only within the toc list itself — never let this bubble up to
    // the page scroll, which happens if we use el.scrollIntoView() and the
    // list has no overflow of its own (browser falls back to the window as
    // the "nearest" scrollable ancestor).
    if (container.scrollHeight <= container.clientHeight) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.top < containerRect.top) {
      container.scrollBy({ top: targetRect.top - containerRect.top, behavior: "smooth" });
    } else if (targetRect.bottom > containerRect.bottom) {
      container.scrollBy({ top: targetRect.bottom - containerRect.bottom, behavior: "smooth" });
    }
  }, [activeId]);

  if (items.length === 0) return null;

  const numbered = numberHeadings(items);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4" aria-label="目次">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="relative flex w-full items-center justify-center"
      >
        <span className="font-display text-center text-base font-bold text-foreground-muted">目次</span>
        <FaChevronDown
          className={`absolute right-0 h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ol ref={listRef} className="mt-3 flex max-h-[45vh] flex-col gap-1 overflow-y-auto pr-1 text-sm">
          {numbered.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li key={item.id} className={item.level === 3 ? "ml-4" : ""}>
                <a
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.id, el);
                    else itemRefs.current.delete(item.id);
                  }}
                  href={`#${item.id}`}
                  className={`flex gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    isActive ? "bg-accent-soft font-semibold text-accent-dark" : "hover:bg-surface-muted hover:text-accent-dark"
                  }`}
                >
                  {item.level === 2 && <span className="font-semibold">{item.number}.</span>}
                  <span className="line-clamp-2">{item.text}</span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
