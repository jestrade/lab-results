/**
 * The canonical laboratory-variable catalog (KAN-8).
 *
 * `variables/{variableId}` is reference data: one document per test, carrying
 * the name and explanation in every locale we have them, and the category the
 * variables grid groups by. It is read by any signed-in user and written only
 * by the Admin SDK — see `firestore.rules`.
 *
 * ── Existing entries are never modified ──────────────────────────────────
 *
 * Three things write here — the sheet importer, the backfill, and report
 * processing — and none of them may edit a document that already exists.
 * Curated names and explanations are reviewed content; a laboratory's spelling
 * on one PDF is evidence about that PDF, not a correction to the catalog.
 *
 * The single exception is narrow and deliberate: a document this module has
 * just created carries `needsEnrichment: true`, and enrichment may complete it
 * exactly once, guarded by that flag inside a transaction. A placeholder being
 * filled in is not the same act as reviewed content being overwritten, and the
 * flag is what keeps the two distinguishable.
 *
 * ── Why creation is `create()` and not `set()` ───────────────────────────
 *
 * Two reports processing concurrently will both find "Ferritina" missing and
 * both try to add it. `create()` fails on the second rather than silently
 * overwriting the first, and the caller re-reads instead — so the loser of the
 * race joins the winner's variable rather than replacing it.
 */

import * as logger from 'firebase-functions/logger';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { findMatch, normaliseName, variableId, type MatchCandidate } from './matching';

/**
 * Mirrors `VariableCategory` in `src/domain/types.ts`.
 *
 * Duplicated because `functions/` compiles from its own rootDir and cannot
 * import the app's domain types. The two lists must move together — a
 * category written here that the app does not know renders as "Other".
 */
export const VARIABLE_CATEGORIES = [
  'complete_blood_count',
  'coagulation',
  'lipid_profile',
  'glucose_metabolism',
  'liver_function',
  'kidney_function',
  'thyroid',
  'electrolytes',
  'iron_metabolism',
  'vitamins',
  'hormones',
  'inflammation',
  'allergy',
  'tumour_markers',
  'urinalysis',
  'faecal',
  'semen_analysis',
  'other',
] as const;

export type VariableCategory = (typeof VARIABLE_CATEGORIES)[number];

export function isCategory(value: unknown): value is VariableCategory {
  return (
    typeof value === 'string' && (VARIABLE_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Mirrors `Locale` in `src/domain/locales.ts`. */
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export type Translated = { en: string } & Partial<Record<Locale, string>>;

export interface CatalogEntry extends MatchCandidate {
  id: string;
  canonicalName: string;
  names: Translated;
  descriptions: Partial<Record<Locale, string>>;
  aliases: string[];
  category: VariableCategory;
  defaultUnit: string | null;
  origin: 'catalog' | 'discovered';
  needsEnrichment: boolean;
  /** From `MatchCandidate`: the normalised identity and alias keys. */
  key: string;
  aliasKeys: string[];
}

export function toCatalogEntry(id: string, data: Record<string, unknown>): CatalogEntry {
  const canonicalName = String(data.canonicalName ?? id);
  const aliases = Array.isArray(data.aliases)
    ? (data.aliases as unknown[]).filter((alias): alias is string => typeof alias === 'string')
    : [];

  const names = readTranslated(data.names, canonicalName);
  const descriptions = readOptionalTranslated(data.descriptions);

  // Every name the entry is known by is matchable, not just the aliases: a
  // Spanish report says "Hemoglobina", which is the `es` display name rather
  // than an alias, and it must still resolve here.
  const matchable = [...new Set([...aliases, ...Object.values(names)])];

  return {
    id,
    canonicalName,
    names,
    descriptions,
    aliases,
    category: isCategory(data.category) ? data.category : 'other',
    defaultUnit: typeof data.defaultUnit === 'string' ? data.defaultUnit : null,
    origin: data.origin === 'discovered' ? 'discovered' : 'catalog',
    needsEnrichment: data.needsEnrichment === true,
    key: normaliseName(canonicalName),
    aliasKeys: [...new Set(matchable.map(normaliseName))].filter(Boolean),
  };
}

function readTranslated(value: unknown, fallback: string): Translated {
  const source = (value ?? {}) as Record<string, unknown>;
  const result: Translated = { en: fallback };
  for (const locale of LOCALES) {
    const text = source[locale];
    if (typeof text === 'string' && text.trim()) result[locale] = text.trim();
  }
  return result;
}

function readOptionalTranslated(value: unknown): Partial<Record<Locale, string>> {
  const source = (value ?? {}) as Record<string, unknown>;
  const result: Partial<Record<Locale, string>> = {};
  for (const locale of LOCALES) {
    const text = source[locale];
    if (typeof text === 'string' && text.trim()) result[locale] = text.trim();
  }
  return result;
}

/**
 * Whole-catalog cache, per function instance.
 *
 * The catalog is a few hundred small documents that change rarely, and every
 * report needs all of them to match against — reading it once per instance is
 * the difference between one query and one per result row. A cold instance
 * picks up any changes, which is soon enough for reference data that only an
 * admin, an import or a backfill can alter.
 */
let cache: { entries: CatalogEntry[]; loadedAt: number } | null = null;

/** Long enough to serve a burst of reports, short enough that an import shows up. */
const CACHE_TTL_MS = 10 * 60 * 1000;

export function clearCatalogCache(): void {
  cache = null;
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.entries;

  const snapshot = await getFirestore().collection('variables').get();
  const entries = snapshot.docs.map((doc) => toCatalogEntry(doc.id, doc.data()));

  cache = { entries, loadedAt: Date.now() };
  logger.debug('Catalog loaded', { variables: entries.length });
  return entries;
}

export interface ResolvedVariable {
  variableId: string;
  canonicalName: string;
  names: Translated;
  category: VariableCategory;
  /** True when this call created the entry — the caller enriches those. */
  created: boolean;
}

export interface NewVariableDraft {
  id: string;
  rawName: string;
}

/**
 * Maps every printed name on a report to a catalog variable, creating the ones
 * that are genuinely new.
 *
 * Resolution runs against the stored catalog *and* against the entries this
 * same call is about to create. That second part matters more than it looks:
 * a bilingual report listing "Glucosa" and "Glucose" as separate rows would
 * otherwise miss both in the catalog and create two documents for one test —
 * a duplicate introduced by the very pass meant to prevent them.
 */
export async function resolveVariables(
  rawNames: readonly string[],
): Promise<{ resolved: Map<string, ResolvedVariable>; created: NewVariableDraft[] }> {
  const catalog = await loadCatalog();
  const resolved = new Map<string, ResolvedVariable>();

  // Entries created during this call, matched against alongside the catalog.
  const pending: CatalogEntry[] = [];
  const drafts: NewVariableDraft[] = [];

  for (const rawName of rawNames) {
    if (resolved.has(rawName)) continue;

    const match = findMatch(rawName, [...catalog, ...pending]);
    if (match) {
      if (match.via === 'similarity') {
        logger.info('Variable matched by similarity', {
          rawName,
          variableId: match.entry.id,
          score: Number(match.score.toFixed(3)),
        });
      }
      resolved.set(rawName, {
        variableId: match.entry.id,
        canonicalName: match.entry.canonicalName,
        names: match.entry.names,
        category: match.entry.category,
        created: false,
      });
      continue;
    }

    const draft = await createDiscovered(rawName, [...catalog, ...pending]);
    pending.push(draft.entry);
    if (draft.created) drafts.push({ id: draft.entry.id, rawName });

    resolved.set(rawName, {
      variableId: draft.entry.id,
      canonicalName: draft.entry.canonicalName,
      names: draft.entry.names,
      category: draft.entry.category,
      created: draft.created,
    });
  }

  if (drafts.length > 0) {
    logger.info('Discovered new variables', { count: drafts.length });
    // The cache no longer reflects the collection. Dropping it is cheaper and
    // safer than splicing, and the next report reloads once.
    clearCatalogCache();
  }

  return { resolved, created: drafts };
}

/**
 * Adds a variable seen on a report but absent from the catalog.
 *
 * The document is a deliberate placeholder: the printed name in both locales,
 * category `other`, no explanation, `needsEnrichment: true`. It is written
 * before enrichment runs so that a failed or budget-capped AI call costs the
 * user a plain card rather than a missing one — the values are theirs either
 * way, and the trend engine can group them from this moment on.
 */
async function createDiscovered(
  rawName: string,
  known: readonly CatalogEntry[],
): Promise<{ entry: CatalogEntry; created: boolean }> {
  const db = getFirestore();
  const id = uniqueId(variableId(rawName), known);
  const ref = db.collection('variables').doc(id);

  const document = {
    canonicalName: rawName,
    // The printed name stands in for every locale until enrichment replaces
    // it. A Spanish name shown to an English reader is a visible gap; a blank
    // card is a bug that looks like lost data.
    names: Object.fromEntries(LOCALES.map((locale) => [locale, rawName])),
    descriptions: {},
    aliases: [rawName],
    category: 'other' as VariableCategory,
    defaultUnit: null,
    origin: 'discovered' as const,
    needsEnrichment: true,
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await ref.create(document);
    return { entry: toCatalogEntry(id, document), created: true };
  } catch (error) {
    // Another instance won the race. Its document is the one that counts —
    // joining it is exactly the no-duplicate behaviour this is here for.
    const existing = await ref.get();
    if (existing.exists) {
      logger.debug('Variable already created concurrently', { variableId: id });
      return { entry: toCatalogEntry(id, existing.data() ?? {}), created: false };
    }
    throw error;
  }
}

/**
 * A document id no existing variable is using.
 *
 * Only reached when two *different* tests normalise to the same readable id —
 * the matcher has already ruled out their being the same thing, so they need
 * separate documents and the second takes a suffix.
 */
function uniqueId(base: string, known: readonly CatalogEntry[]): string {
  const taken = new Set(known.map((entry) => entry.id));
  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
