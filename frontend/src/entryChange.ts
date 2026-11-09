import type { Category, CategoryGroup, Entry, ListContents } from "./api";

/**
 * Applies the server's answer to an edit of one Entry onto the local copy, so a save needs no
 * refetch. The Category lives on the Product: a changed Category moves every Entry of that Product.
 * Returns null when the new Category is unknown here (the caller then refetches).
 */
export function applyEntryChange(
  contents: ListContents,
  entry: Entry,
  version: number,
  categories: Category[],
): ListContents | null {
  const all = contents.categories.flatMap((g) => g.entries);
  const before = all.find((e) => e.id === entry.id);
  if (!before) return null; // gone meanwhile; let a refetch decide
  const moved = before.category !== entry.category;
  const next = all.map((e) => {
    if (e.id === entry.id) return entry;
    return moved && e.product_id === entry.product_id ? { ...e, category: entry.category } : e;
  });
  const list = { ...contents.list, version: Math.max(contents.list.version, version) };
  if (!moved) {
    return {
      list,
      categories: contents.categories.map((g) => ({
        ...g,
        entries: g.entries.map((e) => next.find((n) => n.id === e.id) ?? e),
      })),
    };
  }
  const known = new Map<string, Pick<CategoryGroup, "emoji" | "name">>(
    categories.map((c) => [c.key, { emoji: c.emoji, name: c.name }]),
  );
  if (!known.has(entry.category)) return null;
  const groups: CategoryGroup[] = [];
  for (const c of categories) {
    const entries = next.filter((e) => e.category === c.key).sort((a, b) => a.id - b.id);
    if (entries.length > 0) {
      groups.push({ key: c.key, emoji: c.emoji, name: c.name, count: entries.length, entries });
    }
  }
  // An Entry in a Category this client does not know would vanish; refetch instead.
  if (groups.reduce((n, g) => n + g.entries.length, 0) !== next.length) return null;
  return { list, categories: groups };
}
