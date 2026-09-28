"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns the id of the heading the reader is currently under, based on which
 * heading's top has most recently scrolled past `offset` px from the
 * viewport top. Headings are expected in document order.
 */
export function useScrollSpy(ids: string[], offset = 120): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const key = ids.join("|");
  const tickingRef = useRef(false);

  useEffect(() => {
    if (!key) return;
    const targetIds = key.split("|");

    function measure() {
      let current: string | null = null;
      for (const id of targetIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - offset <= 0) {
          current = id;
        }
      }
      setActiveId(current);
    }

    function handleScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        measure();
        tickingRef.current = false;
      });
    }

    measure();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [key, offset]);

  return activeId;
}
