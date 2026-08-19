#!/usr/bin/env node
/**
 * Executes the merge and remove verdicts of a catalog review (KAN-8, KAN-49).
 *
 *   npm --prefix functions run build
 *   node functions/scripts/merge-variables.mjs                 # dry run
 *   node functions/scripts/merge-variables.mjs --apply
 *
 * This is the one script in the repository that moves and deletes a user's
 * stored history, so everything about it is arranged around being able to
 * undo it and around refusing when it is not sure.
 *
 * ── What a merge actually is ──────────────────────────────────────────────
 *
 * A series document is keyed by variable id — `users/{uid}/variableSeries/{id}`
 * — so two catalog entries for one test mean two documents holding half a
 * history each, both drawing a trend across the part they can see. Merging is
 * moving one into the other and deleting the catalog entry left behind.
 *
 * Two cases, and they carry different risk:
 *
 *   the target has no series   a move. The document is rewritten under the
 *                              surviving id with the surviving entry's names,
 *                              and nothing about the values changes.
 *   the target has a series    a join. Two sets of points become one, the
 *                              latest reading is whichever is newer, and the
 *                              trend is recomputed across the union.
 *
 * ── Why the units are checked before a join ──────────────────────────────
 *
 * Because a name can be right and the scale wrong. `plan-series-merge.mjs`
 * documents the real example: urea and BUN are the same substance reported on
 * scales that differ by a factor of 2.14, and a merge of the two produces a
 * series that looks plausible and describes nothing that happened to anybody.
 * A join whose two sides disagree about the unit is refused and reported, not
 * resolved by guessing which one is right.
 *
 * ── Why the plan is grouped by destination ───────────────────────────────
 *
 * Several ids commonly collapse into one: `chcm`, `mchc` and
 * `concentracion-promedio-de-hb-corpuscular` are three spellings of MCHC and
 * all three point at the same surviving entry. A plan that walked the merge
 * list one entry at a time would write that destination once per source, and
 * a whole-document `set()` means the last write wins — the earlier histories
 * deleted and their values replaced rather than combined. That happened on the
 * first run of this script; the snapshot is what made it a ten-minute
 * correction instead of lost health data.
 *
 * So the unit of work is the destination document, not the merge verdict.
 * Every source aimed at one document is folded into it in a single write.
 *
 * ── The trend is not recomputed by hand ──────────────────────────────────
 *
 * `calculateTrend` and `MAX_SERIES_POINTS` are imported from the compiled
 * pipeline rather than reimplemented, so a merged document is the one the
 * trend engine would have written if the results had arrived under one id in
 * the first place. A second implementation of that rule is a second answer to
 * "which way is this going", and the two would drift.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../lib');
const REVIEW = resolve(HERE, '../../config/variable-review.json');
const BACKUPS = resolve(HERE, 'backups');

const apply = process.argv.includes('--apply');
const stamp = process.argv.includes('--stamp')
  ? process.argv[process.argv.indexOf('--stamp') + 1]
  : new Date().toISOString().replace(/[:.]/g, '-');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key.');
  process.exit(1);
}

let calculateTrend;
let MAX_SERIES_POINTS;
try {
  ({ calculateTrend, MAX_SERIES_POINTS } = await import(`${LIB}/trends.js`));
} catch (error) {
  console.error(
    `Could not load the compiled pipeline from ${LIB}.\n` +
      'Run: npm --prefix functions run build\n\n' +
      String(error?.message ?? error),
  );
  process.exit(1);
}

const review = JSON.parse(readFileSync(REVIEW, 'utf8'));

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const catalog = new Map();
(await db.collection('variables').get()).forEach((d) => catalog.set(d.id, d.data()));

/** Every user series, indexed by variable id then by owning document ref. */
const seriesByVariable = new Map();
(await db.collectionGroup('variableSeries').get()).forEach((d) => {
  if (!seriesByVariable.has(d.id)) seriesByVariable.set(d.id, []);
  seriesByVariable.get(d.id).push({ ref: d.ref, path: d.ref.path, data: d.data() });
});

/**
 * Do two series agree about what they are measuring?
 *
 * A missing unit on either side is not a disagreement — plenty of results are
 * reported without one — but two different units are, and that is the case
 * that silently fabricates a series.
 */
function unitsAgree(a, b) {
  // Normalises away the ways two laboratories write the same scale and nothing
  // else. `10^3cell/ul` and `x10^3/uL` are one unit written twice — verified
  // against the stored values before this was loosened, not assumed: both
  // sides of that pair carry a 0.7 upper reference bound and values in the
  // same tenths. What it must keep catching is a real difference of scale —
  // mg/dL against g/dL, a percentage against a count — so only the multiplier
  // prefix and the counted noun are stripped.
  const norm = (u) =>
    (u ?? '')
      .toLowerCase()
      .replace(/[\s^]/g, '')
      .replace(/^x/, '')
      .replace(/cells?|c[eé]lulas?/g, '')
      // `gr/dL` is how a Spanish-language report writes g/dL. Anchored, so
      // `mg/dL` is untouched — collapsing a milli- prefix would be the exact
      // scale error this check exists to catch.
      .replace(/^gr(?=\/|$)/, 'g');
  if (!norm(a) || !norm(b)) return true;
  return norm(a) === norm(b);
}

const millis = (value) =>
  value?.toMillis?.() ?? (value?._seconds ? value._seconds * 1000 : 0);

/** The union of two series, as the trend engine would have written it. */
function join(source, target) {
  const points = new Map();
  for (const point of [...(target.points ?? []), ...(source.points ?? [])]) {
    points.set(millis(point.observedAt), point);
  }
  const ordered = [...points.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-MAX_SERIES_POINTS);

  // Whichever side carries the newer reading owns the "latest" fields and the
  // reference range, because a range belongs to the result it was printed on.
  const newer = millis(source.latestObservedAt) > millis(target.latestObservedAt) ? source : target;

  return {
    latestValue: newer.latestValue ?? null,
    latestRawValue: newer.latestRawValue ?? '',
    latestStatus: newer.latestStatus ?? 'unknown',
    latestObservedAt: newer.latestObservedAt,
    referenceRange: newer.referenceRange,
    resultCount: (target.resultCount ?? 0) + (source.resultCount ?? 0),
    points: ordered.map(([, point]) => point),
    trend: calculateTrend({
      points: ordered.map(([at, point]) => ({ value: point.value, at })),
      rangeLow: newer.referenceRange?.low ?? null,
      rangeHigh: newer.referenceRange?.high ?? null,
    }),
  };
}

// ── Plan ────────────────────────────────────────────────────────────────

const plan = { groups: new Map(), deletes: [], blocked: [], catalogDeletes: [] };

for (const entry of review.remove ?? []) {
  if (catalog.has(entry.id)) plan.catalogDeletes.push(entry.id);
  for (const series of seriesByVariable.get(entry.id) ?? []) {
    plan.deletes.push({ id: entry.id, path: series.path });
  }
}

for (const merge of review.merge ?? []) {
  const survivor = catalog.get(merge.into);
  if (!survivor) {
    plan.blocked.push({ ...merge, why: `target "${merge.into}" is not in the catalog` });
    continue;
  }

  for (const source of seriesByVariable.get(merge.id) ?? []) {
    const owner = source.ref.parent.parent;
    const targetRef = owner.collection('variableSeries').doc(merge.into);
    const existing =
      (seriesByVariable.get(merge.into) ?? []).find((s) => s.path === targetRef.path)?.data ?? null;

    const group = plan.groups.get(targetRef.path) ?? {
      targetRef,
      survivor,
      into: merge.into,
      existing,
      sources: [],
    };
    group.sources.push({ ref: source.ref, data: source.data, from: merge.id });
    plan.groups.set(targetRef.path, group);
  }
}

// Every side of a destination has to agree about the scale before anything is
// folded — one disagreement blocks that destination entirely rather than
// merging the parts that happen to match.
for (const [path, group] of plan.groups) {
  const units = [group.existing?.unit, ...group.sources.map((s) => s.data.unit)];
  const clash = units.find((unit) => !unitsAgree(unit, units.find((u) => u) ?? null));
  if (clash !== undefined && !unitsAgree(clash, units.find((u) => u) ?? null)) {
    plan.blocked.push({
      id: group.sources.map((s) => s.from).join(', '),
      into: group.into,
      why: `units disagree across ${units.filter(Boolean).join(' / ')}`,
    });
    plan.groups.delete(path);
  }
}

const blockedIds = new Set(plan.blocked.flatMap((b) => String(b.id).split(', ')));
for (const merge of review.merge ?? []) {
  if (catalog.has(merge.id) && !blockedIds.has(merge.id)) plan.catalogDeletes.push(merge.id);
}

const moves = [...plan.groups.values()].filter((g) => !g.existing && g.sources.length === 1);
const folds = [...plan.groups.values()].filter((g) => g.existing || g.sources.length > 1);

// ── Report ──────────────────────────────────────────────────────────────

console.log(`Review of ${review.reviewedOn}, resolved ${review.resolvedOn ?? '—'}\n`);
console.log(`  destinations written: ${plan.groups.size}`);
console.log(`    of those, a plain move: ${moves.length}`);
console.log(`    of those, a fold of two or more histories: ${folds.length}`);
console.log(`  source series absorbed: ${[...plan.groups.values()].reduce((n, g) => n + g.sources.length, 0)}`);
console.log(`  series deleted (laboratory control rows): ${plan.deletes.length}`);
console.log(`  catalog entries removed: ${plan.catalogDeletes.length}`);
console.log(`  refused: ${plan.blocked.length}`);

if (folds.length) {
  console.log('\nFolds — histories becoming one:');
  for (const g of folds) {
    const parts = [
      ...(g.existing ? [`${g.into}:${(g.existing.points ?? []).length}`] : []),
      ...g.sources.map((s) => `${s.from}:${(s.data.points ?? []).length}`),
    ];
    console.log(`  ${g.into}  <-  ${parts.join(' + ')} points`);
  }
}
if (plan.blocked.length) {
  console.log('\nRefused — left exactly as they are:');
  plan.blocked.forEach((b) => console.log(`  ${b.id} -> ${b.into}: ${b.why}`));
}

if (!apply) {
  console.log('\nDry run. Nothing was written. Re-run with --apply.');
  process.exit(0);
}

// ── Snapshot, then write ────────────────────────────────────────────────

mkdirSync(BACKUPS, { recursive: true });
const backupPath = resolve(BACKUPS, `merge-${stamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      takenAt: new Date().toISOString(),
      catalog: [...catalog.entries()]
        .filter(([id]) => plan.catalogDeletes.includes(id))
        .map(([id, data]) => ({ id, data })),
      series: [...plan.groups.values()].flatMap((g) =>
        g.sources.map((s) => ({
          path: s.ref.path,
          data: s.data,
          target: g.targetRef.path,
          targetData: g.existing,
        })),
      ),
      deleted: plan.deletes.map((d) => ({
        path: d.path,
        data: seriesByVariable.get(d.id).find((s) => s.path === d.path).data,
      })),
    },
    null,
    2,
  ),
);
console.log(`\nSnapshot written to ${backupPath}`);

let absorbed = 0;
for (const group of plan.groups.values()) {
  // Fold every source into the destination before writing it once. Starting
  // from the existing history when there is one, and from the first source
  // when there is not.
  let folded = group.existing ? { ...group.existing } : null;
  for (const source of group.sources) {
    folded = folded ? { ...folded, ...join(source.data, folded) } : { ...source.data };
    absorbed += 1;
  }

  await group.targetRef.set({
    ...folded,
    variableId: group.into,
    canonicalName: group.survivor.canonicalName,
    names: group.survivor.names ?? {},
    aliases: group.survivor.aliases ?? [],
    category: group.survivor.category ?? 'other',
    unit: group.existing?.unit ?? group.sources.find((s) => s.data.unit)?.data.unit ?? null,
  });

  for (const source of group.sources) await source.ref.delete();
}

for (const d of plan.deletes) await db.doc(d.path).delete();
for (const id of plan.catalogDeletes) await db.collection('variables').doc(id).delete();

console.log(
  `\nWrote ${plan.groups.size} destinations, absorbing ${absorbed} series; ` +
    `deleted ${plan.deletes.length} control series and ${plan.catalogDeletes.length} catalog entries.`,
);
console.log('\nUndo: node functions/scripts/restore-merge.mjs --file ' + backupPath + ' --apply');
