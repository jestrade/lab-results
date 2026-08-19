/**
 * Paging a long table (KAN-49, KAN-50).
 *
 * Pure arithmetic over a list the caller already holds. Nothing here fetches
 * anything, and that is the design rather than a shortcut — see below.
 *
 * ── Why the pages are cut client-side ─────────────────────────────────────
 *
 * The obvious implementation is a Firestore cursor: twenty-five documents per
 * query, `startAfter` the last one. Both admin screens would break in a way
 * that is hard to see and expensive to have shipped.
 *
 * The catalog console's most valuable check compares a draft against *every*
 * entry that exists, because a duplicate is only a duplicate relative to the
 * whole catalog (`validateDraft` in `domain/adminCatalog.ts`). Cut the fetch
 * into pages and the check silently narrows to whichever twenty-five entries
 * happen to be on screen — it would still render, still say nothing, and be
 * wrong exactly when it mattered. The same goes for the search on both
 * screens: a query that only reaches the loaded page answers "no such
 * account" for an account that exists, which is the one wrong answer an admin
 * console must not give.
 *
 * So the fetch stays whole and the *presentation* is paged. What bounds the
 * cost is the fetch itself, and each screen bounds it in the way that suits
 * what it is reading: the catalog is reference data with a known ceiling and
 * is read entire, while accounts grow without limit and are read through a
 * window the admin can widen (`ACCOUNT_PAGE_SIZE`).
 */

/**
 * Rows per page.
 *
 * Twenty-five: enough that the common case — a filtered catalog, a search for
 * one account — lands on a single page and needs no paging at all, and few
 * enough that the page can be scanned without the header scrolling away.
 */
export const PAGE_SIZE = 25;

/**
 * How many pages a list needs.
 *
 * Never zero. An empty list is one empty page, not none: a table showing
 * "page 0 of 0" is a table reporting a bug, and every caller would otherwise
 * need its own guard before dividing.
 */
export function pageCount(total: number, size: number = PAGE_SIZE): number {
  if (size <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

/**
 * The nearest page that actually exists.
 *
 * This is what stops the failure every paged table eventually has: filter a
 * list down to three rows while sitting on page 5 and the table renders empty,
 * with working controls and nothing to say why. Clamping turns that into the
 * last page of the new result.
 *
 * Also absorbs whatever a hand-edited URL carries — `?page=abc`, `?page=-2`,
 * `?page=1e9` — because the address bar is an input like any other.
 */
export function clampPage(page: number, total: number, size: number = PAGE_SIZE): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.floor(page)), pageCount(total, size));
}

/** The rows on one page. Clamps first, so an out-of-range page is never blank. */
export function pageSlice<T>(
  rows: readonly T[],
  page: number,
  size: number = PAGE_SIZE,
): T[] {
  const safe = clampPage(page, rows.length, size);
  const start = (safe - 1) * size;
  return rows.slice(start, start + size);
}

export interface PageWindow {
  /** 1-indexed, inclusive — what a person counts, not what an array indexes. */
  from: number;
  to: number;
  total: number;
}

/**
 * The "showing 26–50 of 178" numbers.
 *
 * `from` is 0 on an empty list rather than 1, so the sentence reads "0 of 0"
 * instead of claiming a first row that is not there.
 */
export function pageWindow(
  page: number,
  total: number,
  size: number = PAGE_SIZE,
): PageWindow {
  if (total === 0) return { from: 0, to: 0, total: 0 };
  const safe = clampPage(page, total, size);
  const from = (safe - 1) * size + 1;
  return { from, to: Math.min(total, from + size - 1), total };
}

/** A gap in the numbered controls, where pages were left out. */
export const PAGE_GAP = 'gap';
export type PageEntry = number | typeof PAGE_GAP;

/**
 * The page numbers to draw, with gaps where a run was skipped.
 *
 * First and last are always present, because "how long is this list" is a
 * question the control should answer without being operated. Around the
 * current page a fixed number of neighbours keeps the control from changing
 * width as the reader moves through it — a row of buttons that reflows under
 * the cursor is one that gets misclicked.
 */
export function pageNumbers(
  current: number,
  count: number,
  neighbours = 1,
): PageEntry[] {
  const safe = clampPage(current, count * PAGE_SIZE, PAGE_SIZE);
  const shown = new Set<number>([1, count]);

  for (let page = safe - neighbours; page <= safe + neighbours; page += 1) {
    if (page >= 1 && page <= count) shown.add(page);
  }

  // Enough room for the ends to breathe: with only one page between a gap and
  // its neighbour, the gap glyph costs the same space as the number it hides.
  if (safe <= neighbours + 2) for (let page = 1; page <= Math.min(count, neighbours + 3); page += 1) shown.add(page);
  if (safe >= count - neighbours - 1) {
    for (let page = Math.max(1, count - neighbours - 2); page <= count; page += 1) shown.add(page);
  }

  const pages = [...shown].sort((left, right) => left - right);
  const entries: PageEntry[] = [];

  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) entries.push(PAGE_GAP);
    entries.push(page);
  });

  return entries;
}

/** Reads `?page=` — absent, malformed and page 1 are all page 1. */
export function readPage(params: URLSearchParams): number {
  const raw = Number(params.get('page'));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
