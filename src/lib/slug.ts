export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[/?#]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
