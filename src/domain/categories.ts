/**
 * The panels the variables grid groups by, as read from Firestore (KAN-8).
 *
 * `variableCategories/{categoryId}` carries the heading in every locale we
 * have it and the position it sits at. It is reference data — readable by any
 * signed-in user, written only by an admin — and it is deliberately not a
 * constant in this file.
 *
 * ── Why the list is data and not a union ─────────────────────────────────
 *
 * A category is a laboratory's panel name, and laboratories keep printing ones
 * we have not seen. As a union it took a deploy of the app *and* a matching
 * deploy of the functions to add one, and the two lists sat in different
 * codebases with a comment asking future readers to keep them in step. A
 * mismatch there is not a type error, it is a heading a reader does not
 * recognise, or a variable filed under a group the grid refuses to draw.
 *
 * So the ids are strings and the catalog is fetched. `seeds/categories.json`
 * is what a fresh project starts with; after that, Firestore is the only
 * source of truth and nothing here reads the seed.
 */

import { DEFAULT_LOCALE, readTranslated, translate, type Locale } from './locales';
import type { LabVariableCategory, VariableCategory } from './types';

/**
 * The fallback every reader shares.
 *
 * Structural rather than data: the extraction prompt is told to answer with it
 * rather than guess a panel, and an entry whose category no longer exists is
 * shown under it. Seeding a project without an `other` document is not fatal —
 * the label falls back to the id — but it is a gap worth knowing about.
 */
export const OTHER_CATEGORY: VariableCategory = 'other';

/**
 * The category list, in a shape the grid and the filters can both use.
 *
 * A value object rather than a bare array because every caller wants one of
 * three things — the display order, a label, or "is this a real id" — and each
 * of those was previously a separate exported constant that could fall out of
 * step with the others.
 */
export interface CategoryCatalog {
  /** The known ids, in the order the grid draws them. */
  readonly ids: readonly VariableCategory[];
  /** True once the collection has been read and had anything in it. */
  readonly loaded: boolean;
  has(category: string): boolean;
  label(category: VariableCategory, locale?: Locale): string;
  /**
   * Arbitrary ids in display order.
   *
   * Ids the catalog does not know are kept and sorted to the end, by label.
   * Dropping them would hide a reader's own results because a category
   * document was deleted — the card is theirs either way.
   */
  sort(categories: Iterable<VariableCategory>, locale?: Locale): VariableCategory[];
}

/** One document. Unreadable fields fall back rather than throwing. */
export function readCategory(id: string, data: Record<string, unknown>): LabVariableCategory {
  return {
    id,
    names: readTranslated(data.names, humanise(id)),
    // Unordered entries sort to the end rather than to the front: a document
    // written without an order is likelier to be a new panel nobody has
    // placed than the most important heading on the page.
    order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : Infinity,
  };
}

export function categoryCatalog(entries: readonly LabVariableCategory[]): CategoryCatalog {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  const label = (category: VariableCategory, locale: Locale = DEFAULT_LOCALE): string => {
    const entry = byId.get(category);
    // An id with no document is shown as itself, tidied. It is a visible gap
    // an admin can act on; a blank heading reads as a rendering bug, and an
    // invented name would be this file guessing what a laboratory calls a
    // panel it has never been told about.
    return entry ? translate(entry.names, locale) : humanise(category);
  };

  const ranked = entries
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((entry) => entry.id);

  const position = new Map(ranked.map((id, index) => [id, index]));

  return {
    ids: ranked,
    loaded: ranked.length > 0,
    has: (category) => byId.has(category),
    label,
    sort(categories, locale = DEFAULT_LOCALE) {
      const collator = new Intl.Collator(locale);
      return [...new Set(categories)].sort((a, b) => {
        const left = position.get(a);
        const right = position.get(b);
        if (left !== undefined && right !== undefined) return left - right;
        // Known before unknown, so a deleted category's cards land after the
        // panels rather than in the middle of them.
        if (left !== undefined) return -1;
        if (right !== undefined) return 1;
        return collator.compare(label(a, locale), label(b, locale));
      });
    },
  };
}

/**
 * The catalog before it has loaded, and after a failed read.
 *
 * Every consumer must render something sensible against this: the grid groups
 * by raw id, the chips list only the categories the reader's own results use,
 * and nothing disappears. A page that needs the fetch to have succeeded before
 * it can draw a card would be a page that shows nothing when Firestore is
 * briefly unreachable.
 */
export const NO_CATEGORIES: CategoryCatalog = categoryCatalog([]);

/** `complete_blood_count` → `Complete blood count`. */
function humanise(id: string): string {
  const words = id.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}
