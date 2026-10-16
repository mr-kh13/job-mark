/**
 * Cuts one page out of a list. A page outside the list moves to the nearest page that exists.
 *
 * @param items - The whole list.
 * @param page - The wanted page, counting from 1.
 * @param size - How many items fit on a page.
 * @returns The items on the page, the page actually used and the number of pages (at least 1).
 */
export function paginate<T>(items: readonly T[], page: number, size: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const used = Math.min(Math.max(page, 1), pageCount);
  return { items: items.slice((used - 1) * size, used * size), page: used, pageCount };
}
