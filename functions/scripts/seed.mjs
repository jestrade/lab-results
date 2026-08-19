#!/usr/bin/env node
/**
 * Loads a fresh project's reference collections from `seeds/`.
 *
 *   node functions/scripts/seed.mjs --dry-run
 *   node functions/scripts/seed.mjs
 *   node functions/scripts/seed.mjs --only categories
 *
 * ── Why this exists rather than a constant in the source ─────────────────
 *
 * The categories and the curated catalog are data the running system reads
 * from Firestore, so that an admin adding a panel or correcting a name is a
 * write rather than a deploy. A brand-new project has neither, and a grid with
 * no categories groups nothing — hence a seed, kept in the repository where it
 * can be diffed and reviewed, and read by nothing at runtime.
 *
 * ── Create-only, like every other writer of reference data ───────────────
 *
 * Re-running this against a seeded project does nothing. It cannot undo an
 * admin's correction, because it never writes over a document that exists.
 * See `docs/variables.md` for why editing live entries is a person's job.
 *
 * Credentials come from the environment:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   export FIRESTORE_EMULATOR_HOST=localhost:8080   # to target the emulator
 */

import { readSeed, CATEGORIES_SEED, VARIABLES_SEED } from './seeds.mjs';
import { openFirestore, createAll, target } from './seed-store.mjs';

const USAGE = `
Load the reference collections from seeds/ into Firestore, creating only.

  --only <what>  "categories" or "variables" (default: both)
  --dry-run      Report what would happen, write nothing
  -h, --help     This message
`.trim();

function parseArgs(argv) {
  const args = { only: null, dryRun: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--only') args.only = argv[++i] ?? '';
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }

  if (args.only && args.only !== 'categories' && args.only !== 'variables') {
    throw new Error(`--only takes "categories" or "variables", not "${args.only}"`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const wanted = (what) => !args.only || args.only === what;

  // Both files are read before anything is written, so a malformed seed fails
  // the run rather than half-seeding a project.
  const categories = wanted('categories') ? readSeed(CATEGORIES_SEED, 'categories') : [];
  const variables = wanted('variables') ? readSeed(VARIABLES_SEED, 'variables') : [];

  const { db, FieldValue } = await openFirestore();
  console.log(`Seeding ${target()}${args.dryRun ? ' (dry run)' : ''}`);

  if (wanted('categories')) {
    const { created, skipped } = await createAll(
      db,
      FieldValue,
      'variableCategories',
      categories,
      { dryRun: args.dryRun },
    );
    report('categories', created, skipped, args.dryRun);
  }

  if (wanted('variables')) {
    const { created, skipped } = await createAll(db, FieldValue, 'variables', variables, {
      dryRun: args.dryRun,
    });
    report('variables', created, skipped, args.dryRun);
  }
}

function report(what, created, skipped, dryRun) {
  console.log(
    dryRun
      ? `  ${what}: would create ${created}, leave ${skipped} untouched.`
      : `  ${what}: created ${created}, left ${skipped} untouched.`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
