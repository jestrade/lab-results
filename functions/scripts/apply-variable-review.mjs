#!/usr/bin/env node
/**
 * Applies a reviewed batch of catalog entries (KAN-49, KAN-8).
 *
 *   node functions/scripts/apply-variable-review.mjs --dry-run
 *   node functions/scripts/apply-variable-review.mjs
 *
 * Reads `seeds/variable-review.json` — a human-reviewed verdict for every
 * entry that was carrying `needsEnrichment: true` — and writes the `enrich`
 * half of it into Firestore.
 *
 * ── Only the enrich half ─────────────────────────────────────────────────
 *
 * The review also carries `merge`, `ambiguous` and `remove` verdicts. This
 * script writes none of them, and that is the whole design:
 *
 *   merge      repointing a user's series from one variable id to another is
 *              a data migration over somebody's health record. It is what
 *              `plan-series-merge.mjs` exists to describe and a person exists
 *              to approve. Doing it as a side effect of an enrichment run is
 *              exactly the "decision rather than a side effect" that script's
 *              header refuses.
 *   ambiguous  entries whose printed name does not say whether it is a
 *              percentage or a count. Writing a guess would put two different
 *              measurements into one history.
 *   remove     the laboratory's own quality-control rows. Deleting is cheap to
 *              do and impossible to notice afterwards, so it stays manual.
 *
 * It does write `reclassify`, which is a different kind of change from an
 * enrichment and validated differently: those entries have already been
 * reviewed, so the "must still carry needsEnrichment" check that protects the
 * enrichments from overwriting somebody else's work would reject every one of
 * them. What it checks instead is that the category being written is one the
 * app knows — a category the grid cannot name renders as "Other", silently,
 * on somebody's result.
 *
 * ── Aliases are unioned, never replaced ──────────────────────────────────
 *
 * Every spelling already on a document came from a real report. The review
 * adds the standard names; it must not drop the printed one that is the reason
 * the entry matched anything in the first place.
 *
 * Credentials come from the environment, as with every script here:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { readFileSync } from 'node:fs';

import { REVIEW_SEED } from './seeds.mjs';

const REVIEW = REVIEW_SEED;

const dryRun = process.argv.includes('--dry-run');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or ' +
      'FIRESTORE_EMULATOR_HOST to target the emulator.',
  );
  process.exit(1);
}

const review = JSON.parse(readFileSync(REVIEW, 'utf8'));

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const snapshot = await db.collection('variables').get();
const stored = new Map();
snapshot.forEach((doc) => stored.set(doc.id, doc.data()));

// Validated against the live collection rather than a list in this file. A
// review that names a panel this project does not have is a review written
// against a different project, and that is worth stopping for.
const categorySnapshot = await db.collection('variableCategories').get();
const CATEGORIES = new Set(categorySnapshot.docs.map((doc) => doc.id));
CATEGORIES.add('other');

// ── Validate before writing anything ────────────────────────────────────
//
// A review is written against a catalog read at some earlier moment. If an id
// has since been enriched, renamed or deleted, the safe move is to stop and
// say so rather than to write over whatever is there now.

const problems = [];
const buckets = ['merge', 'ambiguous', 'remove'];

/** Has this entry already been written by this same review? */
function alreadyApplied(entry, current) {
  return (
    current.needsEnrichment === false &&
    current.canonicalName === entry.canonicalName &&
    current.category === entry.category &&
    (current.descriptions?.en ?? null) === (entry.descriptions.en ?? null)
  );
}

for (const bucket of buckets) {
  for (const entry of review[bucket] ?? []) {
    const current = stored.get(entry.id);
    if (!current) {
      problems.push(`${bucket}: "${entry.id}" is no longer in the catalog.`);
      continue;
    }
    if (current.needsEnrichment !== true) {
      problems.push(
        `${bucket}: "${entry.id}" has already been reviewed by someone else — refusing to overwrite.`,
      );
    }
  }
}

/**
 * Enrichments are checked differently, because re-running a review that has
 * already landed must be a no-op rather than an error.
 *
 * The flag alone cannot tell "this script wrote it an hour ago" apart from
 * "an admin has since edited it in the console" — both leave
 * `needsEnrichment: false`. So the content decides: an entry that already says
 * what the review says is skipped, and one that says something else is a real
 * conflict and stops the run.
 */
const toEnrich = [];
for (const entry of review.enrich ?? []) {
  const current = stored.get(entry.id);
  if (!current) {
    problems.push(`enrich: "${entry.id}" is no longer in the catalog.`);
    continue;
  }
  if (alreadyApplied(entry, current)) continue;
  if (current.needsEnrichment !== true) {
    problems.push(
      `enrich: "${entry.id}" has been edited since this review was written — refusing to overwrite.`,
    );
    continue;
  }
  toEnrich.push(entry);
}

for (const entry of review.merge ?? []) {
  if (!stored.has(entry.into) && !(review.enrich ?? []).some((e) => e.id === entry.into)) {
    problems.push(`merge: "${entry.id}" points at "${entry.into}", which does not exist.`);
  }
}

for (const entry of review.reclassify ?? []) {
  if (!stored.has(entry.id)) {
    problems.push(`reclassify: "${entry.id}" is no longer in the catalog.`);
    continue;
  }
  if (!CATEGORIES.has(entry.category)) {
    problems.push(`reclassify: "${entry.id}" wants category "${entry.category}", which the app does not have.`);
  }
}

if (problems.length > 0) {
  console.error('The review does not match the catalog as it stands:\n');
  problems.forEach((problem) => console.error(`  ${problem}`));
  console.error('\nNothing was written.');
  process.exit(1);
}

// ── Write ───────────────────────────────────────────────────────────────

console.log(
  `Review of ${new Date(review.reviewedOn).toDateString()} — ` +
    `${review.enrich.length} to enrich, ${review.merge.length} merges and ` +
    `${(review.ambiguous ?? []).length + (review.remove ?? []).length} other verdicts left for a person.\n`,
);

let written = 0;
for (const entry of toEnrich) {
  const current = stored.get(entry.id);
  // Union, so a printed spelling that is the reason this entry exists cannot
  // be dropped by a review that did not happen to list it.
  const aliases = [...new Set([...(current.aliases ?? []), ...(entry.aliases ?? [])])];

  const document = {
    canonicalName: entry.canonicalName,
    names: entry.names,
    descriptions: entry.descriptions,
    aliases,
    category: entry.category,
    defaultUnit: entry.defaultUnit ?? null,
    // The same two fields the admin console sets on a save: a person has read
    // this entry, so it is curated content and the enrichment pass must not
    // treat it as a placeholder it may complete.
    origin: 'catalog',
    needsEnrichment: false,
    reviewedAt: FieldValue.serverTimestamp(),
  };

  if (dryRun) {
    console.log(`  ${entry.id}`);
    console.log(`    ${current.canonicalName}  ->  ${entry.canonicalName}`);
    console.log(`    ${current.category} -> ${entry.category}${entry.defaultUnit ? ` [${entry.defaultUnit}]` : ''}`);
    continue;
  }

  await db.collection('variables').doc(entry.id).update(document);
  written += 1;
}

let reclassified = 0;
for (const entry of review.reclassify ?? []) {
  const current = stored.get(entry.id);
  if (current.category === entry.category) continue;

  reclassified += 1;
  if (dryRun) {
    console.log(`  ${entry.id}: ${current.category} -> ${entry.category}`);
    continue;
  }
  await db.collection('variables').doc(entry.id).update({ category: entry.category });
}

if (dryRun) {
  console.log(`\nDry run. ${toEnrich.length} enrichments and ${reclassified} reclassifications would be written; nothing was.`);
} else {
  console.log(`Reclassified ${reclassified} catalog entries.`);
  console.log(`Enriched ${written} catalog entries (${review.enrich.length - toEnrich.length} were already applied).`);
  console.log(
    `\nStill open: ${review.merge.length} merges, ${(review.ambiguous ?? []).length} ambiguous, ` +
      `${(review.remove ?? []).length} to remove. None were touched.`,
  );
}
process.exit(0);
