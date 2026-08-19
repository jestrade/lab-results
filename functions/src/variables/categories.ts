/**
 * The panel list, read from Firestore rather than compiled in (KAN-8).
 *
 * `variableCategories/{categoryId}` is reference data on the same terms as the
 * variable catalog beside it: read by any signed-in user, written only by the
 * Admin SDK and the console.
 *
 * ── Why this is not a constant here ──────────────────────────────────────
 *
 * It was, in two places — this codebase and `src/domain/types.ts` — with a
 * comment in each asking the next reader to keep them in step. They are
 * separate builds and deploy separately, so between the two deploys that add a
 * panel there is a window where one half of the system writes a category the
 * other half will not draw. Reading the list at runtime removes the window and
 * the second copy: an admin adds a document and both halves see it.
 *
 * The seed for a new project is `seeds/categories.json`. Nothing here reads it.
 */

import * as logger from 'firebase-functions/logger';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * The fallback, and the only category id this codebase names.
 *
 * Structural rather than data: a row whose category the model invented becomes
 * `other`, and the prompt is told to answer `other` rather than guess. It has
 * to exist as a literal somewhere, and here — beside the loader that would
 * otherwise have to supply it — is the least surprising place.
 */
export const OTHER_CATEGORY = 'other';

/**
 * Per-instance cache, mirroring `loadCatalog`.
 *
 * Eighteen-odd documents that change a few times a year, needed by every
 * enrichment pass. The TTL is the catalog's, for the same reason: a cold
 * instance picks up an admin's change, which is soon enough for a panel name.
 */
let cache: { ids: Set<string>; loadedAt: number } | null = null;

const CACHE_TTL_MS = 10 * 60 * 1000;

export function clearCategoryCache(): void {
  cache = null;
}

/**
 * The category ids that exist, for validating what the model returns.
 *
 * `other` is added whether or not the collection has a document for it. The
 * fallback must be usable on a project that has not been seeded — otherwise an
 * unrecognised category would have nowhere to fall back to, and enrichment
 * would write a category id that no reader can label.
 */
export async function loadCategoryIds(): Promise<ReadonlySet<string>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.ids;

  const snapshot = await getFirestore().collection('variableCategories').get();
  const ids = new Set(snapshot.docs.map((doc) => doc.id));
  ids.add(OTHER_CATEGORY);

  cache = { ids, loadedAt: Date.now() };
  logger.debug('Categories loaded', { categories: ids.size });
  return ids;
}

/**
 * The id if the collection has it, `other` otherwise.
 *
 * Categories are never repaired by guessing at a near match. A mis-filed
 * variable is not a cosmetic problem — the grid groups by category, and a
 * lipid marker filed under thyroid reads to the user as a claim about how
 * their laboratory grouped the panel.
 */
export function categoryOr(value: unknown, known: ReadonlySet<string>): string {
  return typeof value === 'string' && known.has(value) ? value : OTHER_CATEGORY;
}
