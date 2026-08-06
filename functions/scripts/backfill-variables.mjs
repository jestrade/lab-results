#!/usr/bin/env node
/**
 * Catching the catalog up with variables that were analysed before it existed
 * (KAN-8).
 *
 *   npm --prefix functions run build
 *   node functions/scripts/backfill-variables.mjs --dry-run
 *   node functions/scripts/backfill-variables.mjs
 *
 * Reports processed before the catalog landed wrote their series under a
 * normalised form of whatever the laboratory printed, with no entry behind it,
 * no explanation and no translation. Those users still see their values — the
 * series document carries them — but the card is headed with a laboratory's
 * abbreviation and the variable page has nothing to say about the test.
 *
 * This walks every user's series, finds the variables the catalog is missing,
 * creates them, and runs the same enrichment the pipeline runs, which is what
 * supplies the explanation and the Spanish translation.
 *
 * ── What it deliberately does not do ─────────────────────────────────────
 *
 * When an orphaned series turns out to match a catalog entry under a different
 * id — a series filed as `hemoglobina` against a catalog entry `hemoglobin` —
 * it reports the pair and moves on. Repointing the series would mean merging
 * two histories, recomputing a trend across them, and discarding one document.
 * That is a data migration with a real chance of silently corrupting somebody's
 * history, and it should be somebody's decision, not a side effect of a
 * catalogue top-up.
 *
 * Reads the AI layer from the compiled functions, so build first.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../lib');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipEnrichment = args.includes('--no-enrichment');

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    `
Create catalog entries for variables that were analysed before the catalog existed.

  --dry-run         Report what is missing, write nothing
  --no-enrichment   Create the entries but do not call the AI provider
  -h, --help        This message

Run "npm --prefix functions run build" first — this uses the compiled matcher.
`.trim(),
  );
  process.exit(0);
}

if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or ' +
      'FIRESTORE_EMULATOR_HOST to target the emulator.',
  );
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

let findMatch;
let toCatalogEntry;
let enrichVariables;
try {
  ({ findMatch } = await import(`${LIB}/variables/matching.js`));
  ({ toCatalogEntry } = await import(`${LIB}/variables/catalog.js`));
  ({ enrichVariables } = await import(`${LIB}/variables/enrichment.js`));
} catch (error) {
  console.error(
    `Could not load the compiled functions from ${LIB}.\n` +
      'Run: npm --prefix functions run build\n\n' +
      String(error?.message ?? error),
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

/**
 * Every variable any user has a series for, with the best name we have.
 *
 * A collection-group query rather than a walk over users: the series
 * subcollection is the only place that records which variables have ever been
 * analysed, and the document id is the variable id the pipeline assigned.
 */
async function collectOrphans(catalog) {
  const snapshot = await db.collectionGroup('variableSeries').get();

  const missing = new Map();
  const remappable = [];

  for (const doc of snapshot.docs) {
    const id = doc.id;
    if (catalog.some((entry) => entry.id === id)) continue;
    if (missing.has(id)) continue;

    const data = doc.data();
    // The series stores the name the laboratory printed, which is exactly what
    // the matcher and the enrichment prompt both want.
    const rawName = String(data.canonicalName ?? id.replace(/-/g, ' '));

    const match = findMatch(rawName, catalog);
    if (match) {
      remappable.push({ seriesId: id, rawName, catalogId: match.entry.id, via: match.via });
      continue;
    }

    missing.set(id, rawName);
  }

  return { missing, remappable };
}

const catalogSnapshot = await db.collection('variables').get();
const catalog = catalogSnapshot.docs.map((doc) => toCatalogEntry(doc.id, doc.data()));
console.log(`Catalog holds ${catalog.length} variables.`);

const { missing, remappable } = await collectOrphans(catalog);

if (remappable.length > 0) {
  console.log(
    `\n${remappable.length} series already match a catalog entry under a different id.`,
  );
  console.log('Not changed — repointing a series merges two histories. Review these by hand:');
  for (const item of remappable.slice(0, 20)) {
    console.log(`  ${item.seriesId}  →  ${item.catalogId}   (${item.rawName}, via ${item.via})`);
  }
  if (remappable.length > 20) console.log(`  … and ${remappable.length - 20} more`);
}

/**
 * Entries that exist but were never completed.
 *
 * Creating a placeholder and enriching it are two steps, and only the first is
 * guaranteed — a provider outage, or a batch whose response failed to parse,
 * leaves a document flagged `needsEnrichment` with the laboratory's own
 * wording as its name.
 *
 * Finding those is what makes re-running this script actually resume. Without
 * it the second run reports "nothing missing" and exits, having skipped the
 * very documents the first run failed to finish — which is worse than not
 * claiming resumability at all, because the claim is printed either way.
 */
const flagged = (await db.collection('variables').where('needsEnrichment', '==', true).get()).docs
  .filter((doc) => !missing.has(doc.id))
  .map((doc) => ({ id: doc.id, rawName: String(doc.data().canonicalName ?? doc.id) }));

if (flagged.length > 0) {
  console.log(`\n${flagged.length} existing entr(ies) were created but never enriched.`);
}

if (missing.size === 0 && flagged.length === 0) {
  console.log('\nNothing to backfill: every analysed variable is catalogued and enriched.');
  process.exit(0);
}

if (missing.size > 0) {
  console.log(`\n${missing.size} analysed variable(s) are missing from the catalog:`);
  for (const [id, rawName] of [...missing].slice(0, 25)) console.log(`  ${id}  (${rawName})`);
  if (missing.size > 25) console.log(`  … and ${missing.size - 25} more`);
}

if (dryRun) {
  console.log('\nDry run — nothing written.');
  process.exit(0);
}

// Created as placeholders first, exactly as the pipeline does, so that a
// failure during enrichment still leaves every variable catalogued and
// groupable rather than half of them missing.
const targets = [];
for (const [id, rawName] of missing) {
  try {
    await db
      .collection('variables')
      .doc(id)
      .create({
        canonicalName: rawName,
        names: { en: rawName, es: rawName },
        descriptions: {},
        aliases: [rawName],
        category: 'other',
        defaultUnit: null,
        origin: 'discovered',
        needsEnrichment: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    targets.push({ id, rawName });
  } catch (error) {
    if (error?.code === 6 || /already exists/i.test(String(error?.message))) continue;
    throw error;
  }
}

console.log(`\nCreated ${targets.length} catalog entries.`);

// Newly created and previously stranded are the same job from here on: both
// are documents carrying the flag, and `enrichVariables` re-checks it inside
// its transaction anyway.
targets.push(...flagged);

if (skipEnrichment) {
  console.log('Skipping enrichment (--no-enrichment). Entries remain flagged needsEnrichment.');
  process.exit(0);
}

if (targets.length === 0) {
  console.log('Nothing to enrich.');
  process.exit(0);
}

console.log(`Enriching ${targets.length} entr(ies) — new and previously unfinished.`);

// Batched, because enrichVariables caps one invocation and a long-neglected
// catalog can be hundreds of variables behind. It chunks internally per AI
// call; this is the outer loop over its per-invocation ceiling.
const BATCH = 48;
let enriched = 0;
for (let i = 0; i < targets.length; i += BATCH) {
  const slice = targets.slice(i, i + BATCH);
  process.stdout.write(`Enriching ${i + 1}–${i + slice.length} of ${targets.length}… `);
  const count = await enrichVariables(slice);
  enriched += count;
  console.log(`${count} completed.`);
}

console.log(
  `\nEnriched ${enriched} of ${targets.length}. ` +
    'Anything left flagged can be picked up by re-running this script.',
);
