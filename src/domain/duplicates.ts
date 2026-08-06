/**
 * Duplicate report detection, browser half (KAN-28, spec §40.2).
 *
 * ── What can be known before the bytes are sent ───────────────────────────
 *
 * Three things, and no more: the SHA-256 of the file, its name, and its size.
 * The report date, the laboratory and the values on the page all come out of
 * extraction, which happens server-side after the upload — so the checks here
 * are the ones that can run instantly, and `functions/src/duplicates.ts` runs
 * the content-based ones once there is content to compare. Two halves of one
 * feature, split by where the information exists rather than by preference.
 *
 * ── Warn, never block ─────────────────────────────────────────────────────
 *
 * Nothing in this file decides anything. It produces a *suspicion*, the page
 * puts that suspicion to the user, and the user decides. A laboratory that
 * reissues a corrected report under the same filename, someone re-uploading a
 * file after deleting the first copy, a panel repeated a week later — all of
 * these look like duplicates and all of them are things a person may
 * legitimately want two of. Auto-skipping any of them would lose a health
 * record to a heuristic.
 *
 * ── Why the metadata rule needs two signals ───────────────────────────────
 *
 * Filenames from a laboratory portal are frequently generic — `report.pdf`,
 * `results.pdf`, `Lab Results.pdf` — so a name match alone would fire on
 * genuinely different reports from the same provider, which is exactly the
 * false positive the acceptance criteria call out. Size alone is worse: two
 * unrelated single-page PDFs from one generator are often within bytes of each
 * other. Together they are strong: the same name *and* the same byte count is
 * a coincidence worth a question, and if the bytes were identical the hash
 * would have caught it first.
 */

import type { Report } from './types';

/** Why we think this file may already be here. Ordered strongest first. */
export type DuplicateSignal = 'identical-file' | 'same-name-and-size';

export interface DuplicateMatch {
  report: Report;
  signal: DuplicateSignal;
}

/** What the browser knows about a file it has not uploaded yet. */
export interface UploadCandidate {
  contentHash: string;
  fileName: string;
  fileSize: number;
}

/**
 * Filename reduced to what actually identifies it.
 *
 * A browser that downloads the same file twice names the second one
 * `panel (1).pdf`; some portals append a timestamp or a copy counter. Those
 * suffixes say "downloaded again", which is evidence *for* a duplicate rather
 * than against it, so they come off before comparing. Case and separator style
 * go too: `Lab_Results.pdf` and `lab results.pdf` are the same name typed by
 * two different systems.
 */
export function normaliseFileName(fileName: string): string {
  return (
    fileName
      .toLowerCase()
      .replace(/\.pdf$/, '')
      // ` (1)`, ` copy`, ` copy 2`, `-3` — the ways a second download is marked.
      .replace(/[\s_-]*\(\d+\)$/, '')
      .replace(/[\s_-]+copy(\s*\d+)?$/, '')
      // A separator is required before a bare number, so `20260712.pdf` keeps
      // its name instead of reducing to nothing and matching every other
      // unnameable file.
      .replace(/[\s_-]+\d+$/, '')
      .replace(/[\s_-]+/g, ' ')
      .trim()
  );
}

/**
 * Existing reports that look like the file the user just chose.
 *
 * Returns every match rather than the first, because the dialog names them: a
 * user who is told "this may already exist" and shown one report has to be
 * able to check that one report, and if there are two, hiding the second would
 * be answering a question they did not ask.
 *
 * Ordered strongest signal first, so the dialog leads with the certain match
 * when there is one.
 */
export function findDuplicates(candidate: UploadCandidate, reports: Report[]): DuplicateMatch[] {
  const name = normaliseFileName(candidate.fileName);
  const matches: DuplicateMatch[] = [];

  for (const report of reports) {
    // An empty hash is a report from before hashing existed, not a match for
    // a file whose hash we could not compute. Comparing two blanks would
    // report every such report as identical to everything.
    if (candidate.contentHash && report.contentHash === candidate.contentHash) {
      matches.push({ report, signal: 'identical-file' });
      continue;
    }

    if (
      report.fileSize === candidate.fileSize &&
      name !== '' &&
      normaliseFileName(report.originalFileName) === name
    ) {
      matches.push({ report, signal: 'same-name-and-size' });
    }
  }

  return matches.sort((a, b) => rank(a.signal) - rank(b.signal));
}

function rank(signal: DuplicateSignal): number {
  return signal === 'identical-file' ? 0 : 1;
}

/**
 * The strongest signal across a set of matches.
 *
 * The dialog says something different for "this is byte-for-byte the file you
 * already have" than for "this looks like it", and one file can produce both.
 */
export function strongestSignal(matches: DuplicateMatch[]): DuplicateSignal | null {
  if (matches.length === 0) return null;
  return matches.some((match) => match.signal === 'identical-file')
    ? 'identical-file'
    : 'same-name-and-size';
}
