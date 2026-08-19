#!/usr/bin/env node
/**
 * Puts a snapshot taken by `merge-variables.mjs` back (KAN-8).
 *
 *   node functions/scripts/restore-merge.mjs --file <snapshot> [--apply]
 *
 * The merge writes every document it is about to touch into a snapshot before
 * it touches any of them, and this is what makes that snapshot worth taking.
 *
 * ── Timestamps are the part that needs care ──────────────────────────────
 *
 * A Firestore `Timestamp` serialises to JSON as `{_seconds, _nanoseconds}`,
 * and writing that back produces a document whose dates are ordinary maps. The
 * app calls `.toMillis()` on them, so the restore would look like it worked
 * and every chart would break. Every value is walked and rebuilt on the way
 * in.
 */

import { readFileSync } from 'node:fs';

const file = process.argv[process.argv.indexOf('--file') + 1];
const apply = process.argv.includes('--apply');
if (!file) {
  console.error('Usage: node functions/scripts/restore-merge.mjs --file <snapshot> [--apply]');
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

/** Rebuilds the Timestamps that JSON flattened into plain maps. */
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    if ('_seconds' in value && '_nanoseconds' in value) {
      return new Timestamp(value._seconds, value._nanoseconds);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

const snap = JSON.parse(readFileSync(file, 'utf8'));
console.log(`Snapshot taken ${snap.takenAt}`);
console.log(`  catalog entries to restore: ${snap.catalog.length}`);
console.log(`  source series to restore:   ${snap.series.length}`);
console.log(`  control series to restore:  ${snap.deleted.length}`);

// A target that did not exist before the merge must go back to not existing.
const targetsToClear = new Set(
  snap.series.filter((s) => s.targetData === null).map((s) => s.target),
);
const targetsToReset = new Map(
  snap.series.filter((s) => s.targetData !== null).map((s) => [s.target, s.targetData]),
);
console.log(`  targets to reset:           ${targetsToReset.size}`);
console.log(`  targets to remove again:    ${targetsToClear.size}`);

if (!apply) {
  console.log('\nDry run. Nothing was written. Re-run with --apply.');
  process.exit(0);
}

for (const entry of snap.catalog) {
  await db.collection('variables').doc(entry.id).set(revive(entry.data));
}
for (const s of snap.series) await db.doc(s.path).set(revive(s.data));
for (const d of snap.deleted) await db.doc(d.path).set(revive(d.data));
for (const [path, data] of targetsToReset) await db.doc(path).set(revive(data));
for (const path of targetsToClear) await db.doc(path).delete();

console.log('\nRestored.');
