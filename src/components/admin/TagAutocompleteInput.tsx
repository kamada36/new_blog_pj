"use client";

import { useMemo, useRef, useState } from "react";

type Tag = { id: string; name: string };

export function TagAutocompleteInput({
  tags,
  defaultSelectedIds = [],
  name = "tagIds",
}: {
  tags: Tag[];
  defaultSelectedIds?: string[];
  name?: string;
}) {
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return tags.filter((tag) => !selectedIds.includes(tag.id) && tag.name.toLowerCase().includes(q)).slice(0, 8);
  }, [tags, selectedIds, query]);

  function addTag(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function removeTag(id: string) {
    setSelectedIds((prev) => prev.filter((existing) => existing !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) addTag(suggestions[0].id);
    } else if (e.key === "Backspace" && query === "" && selectedIds.length > 0) {
      removeTag(selectedIds[selectedIds.length - 1]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold">タグ</p>
      <div className="relative mt-2 max-w-md">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
          {selectedIds.map((id) => {
            const tag = tagById.get(id);
            if (!tag) return null;
            return (
              <span
                key={id}
                className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-dark"
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => removeTag(id)}
                  className="text-accent-dark/70 hover:text-accent-dark"
                  aria-label={`${tag.name}を削除`}
                >
                  ×
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 100)}
            onKeyDown={handleKeyDown}
            placeholder={selectedIds.length === 0 ? "タグ名を入力..." : ""}
            className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {isOpen && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
            {suggestions.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(tag.id)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted"
                >
                  {tag.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
