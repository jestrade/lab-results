#!/usr/bin/env node
/**
 * Feeds the laboratory-variable catalog from the maintained spreadsheet
 * (KAN-8).
 *
 *   node functions/scripts/import-variables.mjs --csv variables.csv
 *   node functions/scripts/import-variables.mjs --csv variables.csv --push
 *   node functions/scripts/import-variables.mjs --push --dry-run
 *
 * Two stages, usable together or apart:
 *
 *   --csv <file>   parse a sheet export into config/variables.json
 *   --push         write config/variables.json into Firestore
 *
 * ── Why the sheet lands in git on the way through ────────────────────────
 *
 * The intermediate JSON is not busywork. This is reference content shown to
 * every user as an explanation of their own blood test, and the README calls
 * it reviewed. A file in the repository can be diffed, reviewed in a pull
 * request, and rolled back; a direct sheet-to-production write can be none of
 * those, and nobody would be able to say afterwards what changed or when.
 *
 * ── Existing documents are never touched ─────────────────────────────────
 *
 * The push uses `create()` per document and counts the collisions. Re-running
 * it is safe and, on an unchanged catalog, does nothing at all. Editing an
 * entry that is already live is deliberately not something this script can do:
 * see `docs/variables.md` for why, and for the one supported way to do it.
 *
 * Credentials come from the environment, the same as any other Admin SDK use:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   export FIRESTORE_EMULATOR_HOST=localhost:8080   # to target the emulator
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCatalog } from './sheet-catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const DEFAULT_OUT = resolve(REPO, 'config/variables.json');

function parseArgs(argv) {
  const args = { csv: null, out: DEFAULT_OUT, push: false, dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--csv') args.csv = resolve(process.cwd(), argv[++i] ?? '');
    else if (flag === '--out') args.out = resolve(process.cwd(), argv[++i] ?? '');
    else if (flag === '--push') args.push = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }

  return args;
}

const USAGE = `
Feed the laboratory-variable catalog from the maintained spreadsheet.

  --csv <file>   Parse a Google Sheets CSV export into the catalog file
  --out <file>   Where to write it (default: config/variables.json)
  --push         Write the catalog file into Firestore, creating only
  --dry-run      With --push: report what would happen, write nothing
  -h, --help     This message

Export the sheet with File > Download > Comma-separated values.
`.trim();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.csv && !args.push)) {
    console.log(USAGE);
    return;
  }

  if (args.csv) convert(args);
  if (args.push) await push(args);
}

/** Sheet export → reviewable catalog file. */
function convert(args) {
  const csv = readFileSync(args.csv, 'utf8');
  const { entries, skipped, unknownColumns, recognised, sections, sectionRows } =
    readCatalog(csv);

  console.log(`Read ${entries.length} variables from ${args.csv}`);
  console.log(`  Columns recognised: ${recognised.join(', ') || 'none'}`);
  if (unknownColumns.length > 0) {
    console.log(`  Columns ignored:    ${unknownColumns.join(', ')}`);
  }
  console.log(`  Categories used:    ${sections.join(', ')}`);
  if (sectionRows.length > 0) {
    // Printed because reading a heading is a judgement call: if a variable
    // name appears in this list, it was mistaken for a group and lost.
    console.log(`  Read as group headings: ${sectionRows.join(', ')}`);
  }

  // Anything landing in `other` is either genuinely uncategorised or a panel
  // heading `toCategory` does not know. Worth printing: the fix is one line in
  // CATEGORY_KEYWORDS, but only if somebody notices it is needed.
  const uncategorised = entries.filter((entry) => entry.category === 'other');
  if (uncategorised.length > 0) {
    console.log(
      `  ${uncategorised.length} variable(s) fell into "other" — check the group column:`,
    );
    for (const entry of uncategorised.slice(0, 10)) {
      console.log(`      ${entry.canonicalName}`);
    }
    if (uncategorised.length > 10) console.log(`      … and ${uncategorised.length - 10} more`);
  }

  const untranslated = entries.filter((entry) => !entry.names.es);
  if (untranslated.length > 0) {
    console.log(`  ${untranslated.length} variable(s) have no Spanish name.`);
  }
  if (skipped.length > 0) {
    console.log(`  ${skipped.length} row(s) skipped for having no name.`);
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify({ variables: entries }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${args.out}`);
  console.log('Review the diff, then re-run with --push to load it into Firestore.');
}

/** Catalog file → Firestore, creating only. */
async function push(args) {
  const { variables } = JSON.parse(readFileSync(args.out, 'utf8'));
  if (!Array.isArray(variables) || variables.length === 0) {
    throw new Error(`No variables found in ${args.out}. Run with --csv first.`);
  }

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  // The emulator accepts any credential; production needs a real one, and
  // failing here with the variable's name beats failing later with "16 UNAUTHENTICATED".
  if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or ' +
        'FIRESTORE_EMULATOR_HOST to target the emulator.',
    );
  }

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const target = process.env.FIRESTORE_EMULATOR_HOST ?? 'the live project';
  console.log(`\nPushing ${variables.length} variables to ${target}${args.dryRun ? ' (dry run)' : ''}`);

  let created = 0;
  let skipped = 0;

  for (const variable of variables) {
    const ref = db.collection('variables').doc(variable.id);

    if (args.dryRun) {
      const exists = (await ref.get()).exists;
      if (exists) skipped += 1;
      else created += 1;
      continue;
    }

    try {
      await ref.create({ ...variable, createdAt: FieldValue.serverTimestamp() });
      created += 1;
    } catch (error) {
      // ALREADY_EXISTS is the expected, correct outcome on a re-run: the entry
      // is already there and this script does not edit entries.
      if (error?.code === 6 || /already exists/i.test(String(error?.message))) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  console.log(
    args.dryRun
      ? `Would create ${created}, leave ${skipped} untouched.`
      : `Created ${created}, left ${skipped} untouched.`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
