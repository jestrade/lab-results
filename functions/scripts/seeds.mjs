/**
 * Where the seed files are and how they are read.
 *
 * One module so that "the seed lives in `seeds/`" is stated once. Scripts read
 * these; application code does not — the app and the functions read both
 * collections from Firestore, which is the point of the seed being a seed.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '../..');
export const SEEDS = resolve(REPO, 'seeds');

export const CATEGORIES_SEED = resolve(SEEDS, 'categories.json');
export const VARIABLES_SEED = resolve(SEEDS, 'variables.json');
export const REVIEW_SEED = resolve(SEEDS, 'variable-review.json');

/**
 * The array under `key`, or an error naming the file.
 *
 * Every document needs an id: it is the Firestore document name, and a seed
 * row without one would either be skipped silently or written under a
 * generated id nothing else refers to.
 */
export function readSeed(path, key) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const rows = parsed?.[key];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No "${key}" array found in ${path}`);
  }

  const nameless = rows.filter((row) => typeof row?.id !== 'string' || !row.id.trim());
  if (nameless.length > 0) {
    throw new Error(`${nameless.length} row(s) in ${path} have no id`);
  }

  return rows;
}
