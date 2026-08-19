/**
 * Writing the laboratory-variable catalog (KAN-49).
 *
 * `variables/{variableId}` is the one collection `firestore.rules` lets a
 * browser write directly, and only an admin: `allow write: if isAdmin()`. That
 * is deliberate — the catalog is reference data rather than health data, and
 * nothing here is derived from anything the pipeline computed, so there is no
 * value for a client write to contradict.
 *
 * Every write below goes through `clearVariableCatalogCache()`. The read side
 * caches the whole catalog for the session (see `services/variables.ts`), which
 * is what stops the grid re-reading eighty documents per navigation — and which
 * would otherwise mean an admin's correction was invisible to them until they
 * reloaded the tab.
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import { readTranslated, readTranslatedOptional } from '@/domain/locales';
import type { CatalogDocument } from '@/domain/adminCatalog';
import type { LabVariable, VariableCategory, VariableOrigin } from '@/domain/types';
import { clearVariableCatalogCache } from './variables';

const VARIABLES = 'variables';

/**
 * The whole catalog, live.
 *
 * Subscribed, where the app's own read of the same collection is a one-off
 * fetch. The difference is what each is for: a reader's page needs names that
 * do not change while they look at them, and this is the screen on which they
 * change — an entry edited in another tab, or by another admin working the
 * same review queue, has to appear here without a reload.
 *
 * Unpaged. The catalog is a few hundred small documents, the console's whole
 * job is to see across it, and a page boundary would hide exactly the
 * duplicate an admin came here to find.
 */
export function subscribeToCatalog(
  onChange: (variables: LabVariable[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getDb(), VARIABLES),
    (snapshot) => onChange(snapshot.docs.map((entry) => toVariable(entry.id, entry.data()))),
    (error) => onError?.(error),
  );
}

/**
 * Reads a catalog document.
 *
 * A near-copy of the private `toVariable` in `services/variables.ts`, and left
 * as one on purpose: that function feeds the reader's grid and may grow
 * fallbacks that suit a card, while this one feeds an editor that has to show
 * what is actually stored. Sharing it would make every future change to either
 * a change to both.
 */
function toVariable(id: string, data: Record<string, unknown>): LabVariable {
  const canonicalName = String(data.canonicalName ?? id);

  return {
    id,
    canonicalName,
    names: readTranslated(data.names, canonicalName),
    descriptions: readTranslatedOptional(data.descriptions),
    aliases: Array.isArray(data.aliases)
      ? (data.aliases as unknown[]).filter((alias): alias is string => typeof alias === 'string')
      : [],
    category: (data.category as VariableCategory) ?? 'other',
    defaultUnit: (data.defaultUnit as string | null) ?? null,
    origin: (data.origin as VariableOrigin) ?? 'discovered',
    needsEnrichment: data.needsEnrichment === true,
    createdAt: data.createdAt as LabVariable['createdAt'],
  };
}

/** Thrown by `createVariable` when the id was taken between check and write. */
export class VariableExistsError extends Error {
  constructor(readonly variableId: string) {
    super(`A variable with id "${variableId}" already exists.`);
    this.name = 'VariableExistsError';
  }
}

/**
 * Adds an entry, refusing to overwrite one that is already there.
 *
 * A transaction rather than `setDoc`, for the same reason the pipeline uses
 * `create()` rather than `set()`: the form validated the id against a catalog
 * it loaded seconds ago, and between that check and this write the enrichment
 * pass, an import, or a second admin can have created the same id. `setDoc`
 * would silently replace a curated entry with this one. Losing the race has to
 * be visible, so it throws and the page says so.
 */
export async function createVariable(id: string, document: CatalogDocument): Promise<void> {
  const ref = doc(getDb(), VARIABLES, id);

  await runTransaction(getDb(), async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) throw new VariableExistsError(id);

    transaction.set(ref, {
      ...document,
      // Only ever set here. An edit must not restamp when the entry came into
      // being, so `updateVariable` does not carry this field at all.
      createdAt: serverTimestamp(),
    });
  });

  clearVariableCatalogCache();
}

/**
 * Rewrites an existing entry.
 *
 * `updateDoc` rather than `setDoc`: it fails on a document that has been
 * deleted underneath the editor instead of quietly recreating it without its
 * `createdAt`. An admin editing an entry another admin has just removed should
 * be told, not handed a resurrected copy.
 */
export async function updateVariable(id: string, document: CatalogDocument): Promise<void> {
  await updateDoc(doc(getDb(), VARIABLES, id), { ...document });
  clearVariableCatalogCache();
}

/**
 * Removes an entry from the catalog.
 *
 * What this does *not* touch is the point: a user's `variableSeries` carries
 * its own denormalised name, category and history, so deleting the catalog
 * entry removes the curated wording and nothing of anyone's results — the
 * grid falls back to what their laboratory printed (see `withCatalog`). No
 * value on any card changes, and no history is lost.
 *
 * The entry can, however, come back. The next report that prints that test
 * finds nothing to match and the pipeline creates a fresh placeholder for it,
 * usually under the same id. That is a reason to fix a bad entry rather than
 * delete it, and the dialog says so.
 */
export async function deleteVariable(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), VARIABLES, id));
  clearVariableCatalogCache();
}
