/**
 * Completing catalog entries discovered from real reports (KAN-8, KAN-15).
 *
 * A variable created by `catalog.ts` starts as a placeholder: the printed name
 * in both locales, category `other`, no explanation. This turns it into a
 * usable entry — standard names in English and Spanish, a plain-language
 * description in each, and the category the grid groups by.
 *
 * ── One call, not one per variable ───────────────────────────────────────
 *
 * A user's first upload commonly introduces thirty tests at once. Thirty
 * round-trips would dominate the processing time and the month's AI budget for
 * what is a single, highly repetitive question, so names go up in one batch.
 *
 * ── Enrichment is the one write allowed against an existing document ─────
 *
 * And only under conditions that keep it distinguishable from an edit: the
 * document must still carry `needsEnrichment: true`, the check and the write
 * happen in one transaction, and the flag is cleared as part of it. A curated
 * entry never has the flag, so this can never touch reviewed content, and a
 * second enrichment of the same variable is a no-op rather than a rewrite.
 */

import * as logger from 'firebase-functions/logger';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { getAiProvider } from '../ai/registry';
import { VARIABLE_CATALOG_ENTRY } from '../ai/prompts';
import { AiProviderError } from '../ai/types';
import { clearCatalogCache, isCategory, type VariableCategory } from './catalog';

/**
 * How many variables go into a single AI call.
 *
 * ── Sized against the response, not the request ──────────────────────────
 *
 * Each entry comes back as two names and two descriptions of two to three
 * sentences — roughly 170 tokens once JSON scaffolding is counted. Forty of
 * them is about 7,000 tokens, and asking for that in a 4,096-token budget is
 * not a truncated description: the JSON stops mid-string, the whole response
 * fails to parse, and *every* variable in the batch is left unenriched.
 *
 * Observed exactly that way on a real backfill — a batch of 40 failed with
 * `invalid-response` while a batch of 3 in the same run succeeded. Twelve
 * against `MAX_OUTPUT_TOKENS` leaves roughly four times the headroom needed,
 * which is the right margin for a limit whose overrun costs the batch rather
 * than one row.
 */
export const ENRICHMENT_CHUNK = 12;

/** Output budget per call. Generous next to `ENRICHMENT_CHUNK` on purpose. */
const MAX_OUTPUT_TOKENS = 8192;

/**
 * Ceiling on one invocation, across chunks.
 *
 * A report with more distinct unknown tests than this is either a very large
 * panel or a mis-parse, and neither should be able to turn one upload into an
 * unbounded spend. The remainder stays flagged and the next pass picks it up.
 */
export const MAX_ENRICHMENT_BATCH = 48;

export interface EnrichmentTarget {
  id: string;
  rawName: string;
}

interface EnrichedEntry {
  id: string;
  nameEn: string;
  nameEs: string;
  descriptionEn: string | null;
  descriptionEs: string | null;
  category: VariableCategory;
  unit: string | null;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nameEn: { type: 'string' },
          nameEs: { type: 'string' },
          // Required-and-nullable throughout, for the reason set out at length
          // in `extraction.ts`: merely-optional fields come back as an
          // arbitrary subset, and a silently absent translation would leave
          // half the catalog readable in one language only.
          descriptionEn: { type: 'string', nullable: true },
          descriptionEs: { type: 'string', nullable: true },
          category: { type: 'string' },
          unit: { type: 'string', nullable: true },
        },
        required: [
          'id',
          'nameEn',
          'nameEs',
          'descriptionEn',
          'descriptionEs',
          'category',
          'unit',
        ],
        propertyOrdering: [
          'id',
          'nameEn',
          'nameEs',
          'descriptionEn',
          'descriptionEs',
          'category',
          'unit',
        ],
      },
    },
  },
  required: ['entries'],
} as const;

/**
 * Validates the model's output rather than trusting it.
 *
 * Rows are dropped, never repaired. A row with a missing name would otherwise
 * become a blank card, and an unrecognised category would become a group
 * heading nobody chose — leaving the placeholder in place is the better
 * failure, because it is still the name the laboratory printed.
 */
export function parseEnrichment(raw: unknown, requested: readonly string[]): EnrichedEntry[] {
  const value = raw as { entries?: unknown };
  if (!Array.isArray(value?.entries)) {
    throw new AiProviderError('Enrichment returned no entries array', 'invalid-response');
  }

  const wanted = new Set(requested);
  const seen = new Set<string>();
  const entries: EnrichedEntry[] = [];

  for (const row of value.entries as Partial<EnrichedEntry>[]) {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    // An id we did not ask about is a hallucinated variable, and writing it
    // would put a document in the catalog that no report ever mentioned.
    if (!wanted.has(id) || seen.has(id)) continue;

    const nameEn = text(row.nameEn);
    const nameEs = text(row.nameEs);
    if (!nameEn || !nameEs) continue;

    seen.add(id);
    entries.push({
      id,
      nameEn,
      nameEs,
      descriptionEn: text(row.descriptionEn),
      descriptionEs: text(row.descriptionEs),
      category: isCategory(row.category) ? row.category : 'other',
      unit: text(row.unit),
    });
  }

  return entries;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Fills in the supplied placeholders. Returns how many were completed.
 *
 * Never throws: enrichment is an improvement to a card that already works, and
 * a provider outage must not fail a report whose values were extracted and
 * classified successfully. Failures leave `needsEnrichment: true`, which is
 * what makes the work resumable.
 */
export async function enrichVariables(targets: readonly EnrichmentTarget[]): Promise<number> {
  const batch = targets.slice(0, MAX_ENRICHMENT_BATCH);
  if (batch.length === 0) return 0;

  let applied = 0;

  // Chunked rather than sent whole, and each chunk independent: one bad
  // response must cost twelve variables, not the whole report's worth.
  for (let start = 0; start < batch.length; start += ENRICHMENT_CHUNK) {
    applied += await enrichChunk(batch.slice(start, start + ENRICHMENT_CHUNK));
  }

  if (applied > 0) clearCatalogCache();
  logger.info('Variables enriched', { requested: batch.length, applied });

  return applied;
}

async function enrichChunk(chunk: readonly EnrichmentTarget[]): Promise<number> {
  let entries: EnrichedEntry[];

  try {
    const provider = getAiProvider();
    const ids = chunk.map((target) => target.id);

    const { data } = await provider.generate<EnrichedEntry[]>({
      prompt: VARIABLE_CATALOG_ENTRY,
      input: chunk.map((target) => `${target.id}: ${target.rawName}`).join('\n'),
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      parse: (raw) => parseEnrichment(raw, ids),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    entries = data;
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : 'unknown';
    logger.warn('Variable enrichment chunk failed; placeholders left in place', {
      code,
      variables: chunk.length,
    });
    return 0;
  }

  const results = await Promise.all(entries.map(applyEnrichment));
  return results.filter(Boolean).length;
}

/** One guarded write. False when the entry was curated or already completed. */
async function applyEnrichment(entry: EnrichedEntry): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection('variables').doc(entry.id);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    // The guard, not an optimisation. Anything without the flag is either
    // reviewed content or already enriched, and neither may be rewritten.
    if (!snapshot.exists || snapshot.data()?.needsEnrichment !== true) return false;

    const rawName = String(snapshot.data()?.canonicalName ?? entry.nameEn);

    tx.update(ref, {
      canonicalName: entry.nameEn,
      names: { en: entry.nameEn, es: entry.nameEs },
      descriptions: {
        ...(entry.descriptionEn ? { en: entry.descriptionEn } : {}),
        ...(entry.descriptionEs ? { es: entry.descriptionEs } : {}),
      },
      // The name as the laboratory printed it stays matchable alongside the
      // standard names, so the next report from that laboratory resolves here
      // exactly rather than by similarity.
      aliases: FieldValue.arrayUnion(rawName),
      category: entry.category,
      defaultUnit: entry.unit,
      // Descriptions are the part that must not be silently regenerated by a
      // different prompt later; the version records which one wrote them.
      enrichment: {
        promptVersion: VARIABLE_CATALOG_ENTRY.version,
        generatedAt: new Date().toISOString(),
      },
      needsEnrichment: false,
    });

    return true;
  });
}
