import GithubSlugger from "github-slugger";

export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

const HEADING_LINE = /^(#{2,3})\s+(.+)$/;

/**
 * Extracts H2/H3 headings from markdown and slugifies them with the same
 * algorithm rehype-slug uses internally, so ids line up with the rendered
 * article body's anchor links.
 */
export function extractHeadings(markdown: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];

  for (const line of markdown.split("\n")) {
    const match = HEADING_LINE.exec(line.trim());
    if (!match) continue;
    const level = match[1].length as 2 | 3;
    const text = match[2].replace(/[#*`]/g, "").trim();
    const id = slugger.slug(text);
    items.push({ id, text, level });
  }

  return items;
}

export type NumberedTocItem = TocItem & { number: number };

/** Numbers H2 entries sequentially (H3s inherit their parent's number implicitly via nesting). */
export function numberHeadings(items: TocItem[]): NumberedTocItem[] {
  let counter = 0;
  return items.map((item) => {
    if (item.level === 2) counter += 1;
    return { ...item, number: counter };
  });
}
