#!/usr/bin/env node
/**
 * Planning the reunion of histories split across two variable ids (KAN-8).
 *
 *   npm --prefix functions run build
 *   node functions/scripts/plan-series-merge.mjs
 *
 * READ ONLY. This computes and prints what a merge would do and writes
 * nothing — no document is created, altered or deleted by this script.
 *
 * ── The problem it describes ─────────────────────────────────────────────
 *
 * A series document is keyed by variable id, and that id used to be a
 * normalised form of whatever the laboratory printed — `colesterol-hdl`. Once
 * the catalog landed, the pipeline began keying on the catalog's id instead —
 * `hdl-cholesterol`. Both are reasonable; they are simply not the same string.
 *
 * The consequence is invisible and bad. A user with two HDL results already
 * stored gets a third from their next report, it lands in a new document, and
 * the app shows a history of two and a history of one, each with a trend
 * computed over part of the data. Nothing on either card says it is a
 * fragment. That is the same class of harm as merging two different tests,
 * reached from the opposite direction.
 *
 * ── Why the plan is worth reading before anything acts on it ─────────────
 *
 * A wrong pair does not fail loudly; it fabricates a measurement series. The
 * matcher is good but it is matching names, and names lie about scale — see
 * the urea note below, which is a real pair this script proposes and which a
 * human must reject.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../lib');

/**
 * Pairs the matcher proposes that a human has judged wrong.
 *
 * `urea-serica` → `blood-urea-nitrogen` is the standing example. Serum urea
 * and blood urea nitrogen measure the same molecule and report different
 * quantities: urea counts the whole molecule (MW 60), BUN only its nitrogen
 * (MW 28), so urea ≈ BUN × 2.14. The stored series makes it plain — 31.2 mg/dL
 * against a 16.6–48.5 range is a urea result; the same number read as BUN
 * would be markedly high.
 *
 * Folding them together would put two scales on one axis, and the first BUN
 * result to arrive would draw a fifty-percent fall that never happened.
 *
 * The underlying fault is in the catalog, not in the data: the sheet gives
 * "Blood Urea Nitrogen (BUN)" the Spanish name "Urea (BUN)", which makes plain
 * "Urea" an alias of BUN. Correcting that is a sheet edit.
 */
const REJECTED = ['urea-serica'];

if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or ' +
      'FIRESTORE_EMULATOR_HOST to target the emulator.',
  );
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

let findMatch;
let toCatalogEntry;
let mergePoints;
let calculateTrend;
let MAX_SERIES_POINTS;
try {
  ({ findMatch } = await import(`${LIB}/variables/matching.js`));
  ({ toCatalogEntry } = await import(`${LIB}/variables/catalog.js`));
  ({ mergePoints, calculateTrend, MAX_SERIES_POINTS } = await import(`${LIB}/trends.js`));
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

const catalog = (await db.collection('variables').get()).docs.map((d) =>
  toCatalogEntry(d.id, d.data()),
);
const catalogIds = new Set(catalog.map((entry) => entry.id));

const series = await db.collectionGroup('variableSeries').get();
console.log(`${series.size} series documents, ${catalog.length} catalog variables.\n`);

/** Points from both documents, collapsed by instant and capped. */
function combine(a = [], b = []) {
  let points = [];
  for (const point of [...a, ...b]) {
    if (!Number.isFinite(point?.value) || !Number.isFinite(point?.at)) continue;
    points = mergePoints(points, { value: point.value, at: point.at });
  }
  return points.slice(-MAX_SERIES_POINTS);
}

const rejected = [];
const plans = [];

for (const doc of series.docs) {
  if (catalogIds.has(doc.id)) continue;

  const data = doc.data();
  const rawName = String(data.canonicalName ?? doc.id);
  const match = findMatch(rawName, catalog);
  if (!match) continue;

  if (REJECTED.includes(doc.id)) {
    rejected.push({ id: doc.id, to: match.entry.id, rawName });
    continue;
  }

  const owner = doc.ref.parent.parent;
  const target = await owner.collection('variableSeries').doc(match.entry.id).get();
  const to = target.exists ? target.data() : null;

  const points = combine(data.pointsRaw ?? [], to?.pointsRaw ?? []);
  const range = (to ?? data).referenceRange ?? {};

  plans.push({
    owner: owner.id,
    from: doc.id,
    to: match.entry.id,
    via: match.via,
    rawName,
    kind: to ? 'MERGE' : 'RENAME',
    beforeFrom: data.resultCount ?? 0,
    beforeTo: to?.resultCount ?? 0,
    after: points.length,
    values: points.map((p) => p.value),
    unitFrom: data.unit ?? null,
    unitTo: to?.unit ?? null,
    trendBefore: to?.trend ?? data.trend,
    trendAfter: calculateTrend({ points, rangeLow: range.low, rangeHigh: range.high }),
  });
}

const merges = plans.filter((p) => p.kind === 'MERGE');
const renames = plans.filter((p) => p.kind === 'RENAME');

console.log(`${merges.length} split histories would be reunited:\n`);
for (const p of merges) {
  const mismatch = p.unitFrom && p.unitTo && p.unitFrom !== p.unitTo ? '  ⚠ UNIT MISMATCH' : '';
  console.log(`  ${p.from} + ${p.to}   ← "${p.rawName}" via ${p.via}${mismatch}`);
  console.log(
    `      ${p.beforeFrom} + ${p.beforeTo} results → ${p.after}   ` +
      `[${p.values.join(', ')}] ${p.unitTo ?? p.unitFrom ?? ''}`,
  );
  console.log(`      trend ${p.trendBefore} → ${p.trendAfter}`);
}

console.log(`\n${renames.length} would be repointed before they can split:\n`);
for (const p of renames) {
  console.log(
    `  ${p.from} → ${p.to}   ${p.after} results [${p.values.join(', ')}] ${p.unitFrom ?? ''}   ← "${p.rawName}" via ${p.via}`,
  );
}

if (rejected.length > 0) {
  console.log(`\n${rejected.length} proposed pair(s) REJECTED by hand — see REJECTED in this file:`);
  for (const r of rejected) console.log(`  ${r.id} ✗→ ${r.to}   ← "${r.rawName}"`);
}

// Units differing across a merge is the loudest sign a pair is wrong: the same
// test measured twice does not change unit between reports.
const suspect = merges.filter((p) => p.unitFrom && p.unitTo && p.unitFrom !== p.unitTo);
console.log(
  suspect.length > 0
    ? `\n⚠ ${suspect.length} pair(s) disagree on unit. Do not merge these without checking.`
    : '\nNo unit disagreements among the proposed merges.',
);

console.log('\nRead only — nothing was written.');
process.exit(0);
