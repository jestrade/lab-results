/**
 * Editing the laboratory-variable catalog (KAN-49, KAN-8).
 *
 * The rules that govern `variables/{variableId}` everywhere else in this system
 * are "never a duplicate, never an edit" (docs/variables.md): the importer
 * creates and skips, the pipeline creates and reuses, the backfill only fills
 * gaps. This module is the one deliberate exception the documentation already
 * names — the admin console — and it exists because a correction has to come
 * from a person. A script cannot tell a correction from a regression, which is
 * exactly why nothing automated is allowed to make one.
 *
 * ── Why an admin save is also a review ────────────────────────────────────
 *
 * `origin` and `needsEnrichment` describe how much human attention an entry has
 * had: a `discovered` entry carrying `needsEnrichment` is a placeholder the
 * pipeline minted from one report's spelling, and the interface labels its
 * explanation accordingly. Once an admin has opened that entry, read it and
 * saved it, both statements have stopped being true. `reviewed()` below is
 * what makes them stop being stored, and it is applied on every save rather
 * than offered as a checkbox — an admin who has just rewritten the Spanish
 * description should not also have to remember to tick "reviewed", and an
 * entry that keeps the flag after being edited would send the enrichment pass
 * back to overwrite the work.
 *
 * ── Everything here is pure ───────────────────────────────────────────────
 *
 * The page holds a draft as strings, because that is what an input holds. This
 * module turns strings into a document and back, and decides whether a draft is
 * fit to write. Firestore lives in `services/adminCatalog.ts`.
 */

import { LOCALES, type Locale } from './locales';
import { readPage } from './pagination';
import type { LabVariable, VariableCategory, VariableOrigin } from './types';

/**
 * One catalog entry as the editor holds it.
 *
 * Flat, all-strings, one field per input — not a `LabVariable` with optional
 * maps. A half-typed form is not a valid document and modelling it as one
 * would mean every keystroke producing something that claims to be catalog
 * content. The conversion happens once, at save, in `draftToDocument`.
 */
export interface CatalogDraft {
  id: string;
  canonicalName: string;
  /** Display name per locale, keyed by locale code. `en` is required. */
  names: Record<Locale, string>;
  descriptions: Record<Locale, string>;
  /** One alias per line, as typed. Parsed by `parseAliases`. */
  aliases: string;
  category: VariableCategory;
  defaultUnit: string;
}

export function emptyDraft(): CatalogDraft {
  return {
    id: '',
    canonicalName: '',
    names: blankTranslations(),
    descriptions: blankTranslations(),
    aliases: '',
    category: 'other',
    defaultUnit: '',
  };
}

function blankTranslations(): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, ''])) as Record<Locale, string>;
}

/** An existing entry, as the editor holds it. */
export function toDraft(variable: LabVariable): CatalogDraft {
  const names = blankTranslations();
  const descriptions = blankTranslations();

  for (const locale of LOCALES) {
    names[locale] = variable.names[locale] ?? '';
    descriptions[locale] = variable.descriptions[locale] ?? '';
  }

  return {
    id: variable.id,
    canonicalName: variable.canonicalName,
    names,
    descriptions,
    // One per line rather than comma-separated: laboratory names contain
    // commas ("Cholesterol, Total") and splitting on them would quietly turn
    // one alias into two that match nothing.
    aliases: variable.aliases.join('\n'),
    category: variable.category,
    defaultUnit: variable.defaultUnit ?? '',
  };
}

/**
 * Aliases, one per line, blanks dropped and duplicates collapsed.
 *
 * Order is preserved rather than sorted: an admin who lists the abbreviation
 * first meant something by it, and re-ordering their list under them on every
 * save makes the diff between two versions unreadable.
 */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const line of text.split('\n')) {
    const alias = line.trim();
    if (!alias || seen.has(alias.toLowerCase())) continue;
    seen.add(alias.toLowerCase());
    aliases.push(alias);
  }

  return aliases;
}

/**
 * Document id from a name — the same shape `functions/variables/matching.ts`
 * produces for a discovered variable.
 *
 * Deliberately a *suggestion*, not a binding rule: it fills the id field when
 * an admin types a name and is editable afterwards, so a curated entry can keep
 * whatever id the importer gave it. It is not identity — the matcher decides
 * that — and this only has to be readable and legal as a Firestore key.
 *
 * Kept in step with `variableId` in functions/src/variables/matching.ts by
 * shape rather than by import: `functions/` compiles from its own rootDir and
 * cannot be imported here.
 */
export function deriveId(name: string): string {
  const id = name
    .normalize('NFD')
    // Strip combining marks so "Ácido úrico" becomes "acido-urico" rather than
    // an id with characters that survive a URL differently in every browser.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    // A trailing hyphen left by the slice reads as a truncation the id does
    // not otherwise admit to.
    .replace(/-+$/, '');

  return id || 'unnamed-variable';
}

/**
 * Normalised form used only to spot an entry that already exists.
 *
 * Not the matcher. `functions/variables/matching.ts` is the authority on
 * whether two printed names are one test, and it does far more than this —
 * noise-word stripping, token sorting, discriminator guards, edit distance.
 * Reproducing it here would be two implementations of the one rule that must
 * never disagree, so this stays a deliberately dumb exact-match check whose
 * only job is to raise a warning a human then judges.
 */
export function compareKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type DraftErrorField = 'id' | 'canonicalName' | 'nameEn';

export interface DraftProblems {
  /** Blocking. The save button stays disabled while any of these are present. */
  errors: Partial<Record<DraftErrorField, DraftErrorCode>>;
  /**
   * Non-blocking. An entry that looks like one that already exists is usually
   * a mistake and occasionally deliberate — a lab that genuinely prints two
   * distinct tests under near-identical names. The admin decides, so this is
   * shown and not enforced.
   */
  duplicateOf: string | null;
}

export type DraftErrorCode = 'required' | 'invalidId' | 'idTaken';

/** Firestore ids may not contain `/`, be `.`/`..`, or exceed 1500 bytes. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * What is wrong with a draft, if anything.
 *
 * `existing` is the catalog as loaded, so this can answer "is that id already
 * taken" and "does this look like something we already have" without a read.
 * `editingId` is the entry being changed — its own id and name must not count
 * as collisions with itself.
 */
export function validateDraft(
  draft: CatalogDraft,
  existing: readonly LabVariable[],
  editingId: string | null = null,
): DraftProblems {
  const errors: Partial<Record<DraftErrorField, DraftErrorCode>> = {};

  const id = draft.id.trim();
  if (!id) errors.id = 'required';
  else if (!ID_PATTERN.test(id)) errors.id = 'invalidId';
  else if (id !== editingId && existing.some((entry) => entry.id === id)) errors.id = 'idTaken';

  if (!draft.canonicalName.trim()) errors.canonicalName = 'required';
  // English is the fallback for every other locale and the anchor the matcher
  // compares against (see domain/locales.ts), so an entry without it would be
  // both unmatchable and blank for anyone outside the locales it does have.
  if (!draft.names.en.trim()) errors.nameEn = 'required';

  return { errors, duplicateOf: findDuplicate(draft, existing, editingId) };
}

export function hasErrors(problems: DraftProblems): boolean {
  return Object.keys(problems.errors).length > 0;
}

/**
 * An existing entry that this draft appears to restate.
 *
 * Compares every name the draft would be known by — canonical, each locale's
 * display name, each alias — against every name each existing entry is known
 * by, because that is the set the pipeline matches a printed name against.
 */
function findDuplicate(
  draft: CatalogDraft,
  existing: readonly LabVariable[],
  editingId: string | null,
): string | null {
  const keys = new Set(
    [
      draft.canonicalName,
      ...Object.values(draft.names),
      ...parseAliases(draft.aliases),
    ]
      .map(compareKey)
      .filter(Boolean),
  );

  for (const entry of existing) {
    if (entry.id === editingId) continue;
    const theirs = [entry.canonicalName, ...Object.values(entry.names), ...entry.aliases];
    if (theirs.some((name) => keys.has(compareKey(name)))) return entry.id;
  }

  return null;
}

/**
 * The document body for a draft.
 *
 * Empty strings become absent entries rather than empty ones: `readTranslated`
 * already drops blanks on the way in, and writing `{ es: '' }` would store a
 * translation that exists and says nothing — indistinguishable, at a glance in
 * the console, from one that was written and is genuinely empty.
 *
 * `createdAt` is not here. It belongs to the document, not to the edit, and a
 * save that carried it would silently restamp when an entry came into being.
 */
export function draftToDocument(draft: CatalogDraft): CatalogDocument {
  const names: Record<string, string> = {};
  const descriptions: Record<string, string> = {};

  for (const locale of LOCALES) {
    const name = draft.names[locale]?.trim();
    if (name) names[locale] = name;
    const description = draft.descriptions[locale]?.trim();
    if (description) descriptions[locale] = description;
  }

  return {
    canonicalName: draft.canonicalName.trim(),
    names,
    descriptions,
    aliases: parseAliases(draft.aliases),
    category: draft.category,
    defaultUnit: draft.defaultUnit.trim() || null,
    ...reviewed(),
  };
}

export interface CatalogDocument {
  canonicalName: string;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  aliases: string[];
  category: VariableCategory;
  defaultUnit: string | null;
  origin: VariableOrigin;
  needsEnrichment: boolean;
}

/**
 * What passing through this console does to an entry's provenance.
 *
 * `catalog` rather than `discovered`, and no enrichment wanted: a person has
 * read this entry and saved it. Leaving `discovered` would keep the interface
 * captioning a reviewed explanation as unreviewed, and leaving the flag would
 * let the enrichment pass overwrite the admin's own wording the next time it
 * runs — see the transaction in functions/src/variables/enrichment.ts, which
 * treats the flag as permission.
 */
function reviewed(): { origin: VariableOrigin; needsEnrichment: false } {
  return { origin: 'catalog', needsEnrichment: false };
}

// ── Filtering the list ──────────────────────────────────────────────────

export type OriginFilter = 'all' | VariableOrigin;

export interface CatalogFilters {
  query: string;
  category: VariableCategory | 'all';
  origin: OriginFilter;
  /** Only entries the pipeline created and nobody has reviewed. */
  needsReview: boolean;
  /**
   * Which page of the filtered list is on screen.
   *
   * Here with the filters rather than in React state, because it is the same
   * kind of thing: part of what the reader is currently looking at, and no
   * more use to them after a refresh than the search box would be. It also
   * keeps the two in one place, which is what lets a filter change reset the
   * page in a single write instead of two that can disagree.
   */
  page: number;
}

/**
 * Filters from the address bar, and back.
 *
 * Same reasoning as the variables grid: the query string is the only place
 * this state lives, so a refresh keeps the view and a narrowed list can be
 * sent to whoever else is working through the catalog.
 */
export function readFilters(params: URLSearchParams): CatalogFilters {
  const category = params.get('category');
  const origin = params.get('origin');

  return {
    query: params.get('q') ?? '',
    // Any non-empty id, for the reason `readFilters` in domain/variables.ts
    // gives: the ids are Firestore documents now, so there is no compiled-in
    // list to check a URL against and no loaded one this early.
    category: category?.trim() ? category.trim() : 'all',
    origin: origin === 'catalog' || origin === 'discovered' ? origin : 'all',
    needsReview: params.get('review') === '1',
    page: readPage(params),
  };
}

export function filterParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query);
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.origin !== 'all') params.set('origin', filters.origin);
  if (filters.needsReview) params.set('review', '1');
  // Page one is the absence of a page, so a pristine view has a clean URL.
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/**
 * The entries a set of filters selects.
 *
 * Search covers the id and every name the entry is known by, because an admin
 * arrives here from three different directions: a document id out of a log, a
 * name off a report, or the abbreviation a user quoted in a support message.
 */
export function filterCatalog(
  entries: readonly LabVariable[],
  filters: CatalogFilters,
): LabVariable[] {
  const query = compareKey(filters.query);

  return entries.filter((entry) => {
    if (filters.category !== 'all' && entry.category !== filters.category) return false;
    if (filters.origin !== 'all' && entry.origin !== filters.origin) return false;
    if (filters.needsReview && !entry.needsEnrichment) return false;
    if (!query) return true;

    return [entry.id, entry.canonicalName, ...Object.values(entry.names), ...entry.aliases].some(
      (field) => compareKey(field).includes(query),
    );
  });
}

/**
 * Whether the view is narrowed.
 *
 * `page` is deliberately not consulted: it moves through a result without
 * changing what is in it, and counting it would make the "showing 25 of 178"
 * line appear merely because somebody clicked Next.
 */
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.category !== 'all' ||
    filters.origin !== 'all' ||
    filters.needsReview
  );
}
