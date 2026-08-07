/**
 * Duplicate report detection, content half (KAN-28, spec §40.2).
 *
 * The browser checks what it can before an upload — the file's hash, its name
 * and its size (see `src/domain/duplicates.ts`). Everything else the ticket
 * asks us to compare (the report date, the laboratory, the values themselves)
 * only exists once the PDF has been read, which is here.
 *
 * That makes this half strictly better at the job and strictly later at it: it
 * catches the case the file-level check cannot see at all — the same panel
 * downloaded as a fresh PDF, re-exported by the portal, or scanned twice, so
 * that not one byte matches — and it catches it after the report has been
 * stored. So the outcome is a *notice on the report*, not a refusal. Nothing
 * is deleted, nothing is merged, nothing is hidden: the report processes
 * normally, its results are stored normally, and it carries a warning saying
 * which other report it appears to duplicate. What to do about that is the
 * user's decision, taken on a page that shows them both.
 *
 * ── Tuning ────────────────────────────────────────────────────────────────
 *
 * The acceptance criteria want the same panel re-uploaded to be caught and
 * genuinely different reports left alone, which pulls in opposite directions.
 * The resolution is that **the report date is the anchor**. Two reports issued
 * on the same day are already unusual; two issued on the same day by the same
 * laboratory are almost always one report twice. Where the dates match but the
 * laboratory does not (or is not printed), a high overlap of the same tests
 * with the same values is required instead — and "the same values" is a much
 * stronger statement than it looks, because a repeat panel a day later moves
 * almost every number at least slightly.
 *
 * Without a date on either side we fall back to laboratory plus a near-total
 * content match, which is deliberately close to unattainable by chance.
 */

import { Timestamp, type DocumentData, type Firestore, type Query } from 'firebase-admin/firestore';

/** One extracted value, reduced to what identifies it across two reports. */
export interface FingerprintEntry {
  variableId: string;
  /** Numeric when the result was numeric, else the printed text. */
  value: number | null;
  rawValue: string;
}

export interface ReportFingerprint {
  /** `YYYY-MM-DD`, or null when the report did not print a date. */
  reportDate: string | null;
  laboratoryName: string | null;
  entries: FingerprintEntry[];
}

export type DuplicateSignal =
  | 'identical-file'
  | 'same-date-and-laboratory'
  | 'same-date-and-content'
  | 'same-laboratory-and-content';

export interface DuplicateVerdict {
  isDuplicate: boolean;
  signals: DuplicateSignal[];
  /** 0–1 agreement between the two sets of results. */
  similarity: number;
}

/** Overlap required when the dates agree but the laboratory cannot confirm it. */
export const SAME_DATE_SIMILARITY = 0.8;

/** Overlap required when there is no date to anchor on at all. */
export const NO_DATE_SIMILARITY = 0.95;

/** Below this many shared tests, a ratio is not evidence of anything. */
const MIN_COMPARABLE_ENTRIES = 3;

/**
 * Laboratory names reduced to something comparable.
 *
 * The same laboratory prints itself differently on different reports —
 * "Quest Diagnostics", "QUEST DIAGNOSTICS INC.", "Quest Diagnostics, S.L." —
 * and a strict comparison would call those three different providers, which
 * is the failure mode that matters here: it turns a caught duplicate into a
 * missed one.
 */
export function normaliseLaboratory(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    // Combining accents, so "Análisis" and "Analisis" are one laboratory.
    .replace(/[\u0300-\u036f]/g, '')
    // Legal-form suffixes carry no identity: they are the same company.
    .replace(/\b(inc|llc|ltd|limited|sa|s\.a|sl|s\.l|gmbh|plc|corp|co)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * How much two sets of results say the same thing.
 *
 * The measure is agreement over the union of tests, not over the intersection:
 * a report with ten tests and a report with forty that share ten are not the
 * same report, and scoring only the shared ten would call them identical. Each
 * shared test then has to *agree* to count — same variable and same value.
 *
 * Numeric comparison uses a relative tolerance rather than equality, because
 * the same value re-extracted can differ in its last digit ("4.5" and "4.50"
 * are equal; "0.1 + 0.2" arithmetic is not). Non-numeric results compare on
 * their printed text, case-folded — "Negative" and "NEGATIVE" are one answer.
 */
export function contentSimilarity(a: FingerprintEntry[], b: FingerprintEntry[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const byId = new Map(b.map((entry) => [entry.variableId, entry]));
  const union = new Set([...a.map((e) => e.variableId), ...b.map((e) => e.variableId)]);

  let agreeing = 0;
  for (const entry of a) {
    const other = byId.get(entry.variableId);
    if (other && valuesAgree(entry, other)) agreeing += 1;
  }

  return union.size === 0 ? 0 : agreeing / union.size;
}

function valuesAgree(a: FingerprintEntry, b: FingerprintEntry): boolean {
  if (a.value !== null && b.value !== null) {
    const scale = Math.max(Math.abs(a.value), Math.abs(b.value), 1e-9);
    return Math.abs(a.value - b.value) / scale < 0.001;
  }
  // One numeric and one not is a disagreement, not a near miss.
  if (a.value !== null || b.value !== null) return false;
  return a.rawValue.trim().toLowerCase() === b.rawValue.trim().toLowerCase();
}

/**
 * Does `incoming` look like it is already in the account as `existing`?
 *
 * `identicalFile` is passed in rather than recomputed: the hash is on the
 * report document, and a match there is certainty rather than judgement — it
 * short-circuits everything below.
 */
export function judgeDuplicate(
  incoming: ReportFingerprint,
  existing: ReportFingerprint,
  identicalFile = false,
): DuplicateVerdict {
  const similarity = contentSimilarity(incoming.entries, existing.entries);

  if (identicalFile) {
    return { isDuplicate: true, signals: ['identical-file'], similarity };
  }

  const lab = normaliseLaboratory(incoming.laboratoryName);
  const sameLab = lab !== '' && lab === normaliseLaboratory(existing.laboratoryName);
  const sameDate =
    incoming.reportDate !== null && incoming.reportDate === existing.reportDate;

  // Too little overlap to compare is not the same as disagreement, but it is
  // not evidence either — a two-test report cannot support a content claim.
  const comparable =
    Math.min(incoming.entries.length, existing.entries.length) >= MIN_COMPARABLE_ENTRIES;

  const signals: DuplicateSignal[] = [];

  if (sameDate && sameLab) signals.push('same-date-and-laboratory');
  if (sameDate && comparable && similarity >= SAME_DATE_SIMILARITY) {
    signals.push('same-date-and-content');
  }
  if (
    !sameDate &&
    // Only when neither side has a date. Two *different* printed dates are the
    // laboratory telling us these are two different reports, and no amount of
    // matching content overrules that — repeat panels exist, and a person
    // whose results are stable would otherwise have every visit flagged.
    incoming.reportDate === null &&
    existing.reportDate === null &&
    sameLab &&
    comparable &&
    similarity >= NO_DATE_SIMILARITY
  ) {
    signals.push('same-laboratory-and-content');
  }

  return { isDuplicate: signals.length > 0, signals, similarity };
}

/**
 * Reports worth comparing against, and no more.
 *
 * Every candidate costs a read of its whole `results` subcollection, so the
 * query has to be narrow. The two anchors below are the only ones that can
 * produce a verdict at all:
 *
 *   the same file hash — certainty, and cheap (ownerId+contentHash is indexed).
 *   the same report date — the only route to a content verdict, per the tuning
 *                          note at the top of this file.
 *
 * A report with no date of its own falls back to the account's other undated
 * reports, which is the one case where recency has to stand in for an anchor.
 */
const MAX_CANDIDATES = 5;
const UNDATED_SCAN = 20;

/**
 * The other report this one appears to duplicate, if any.
 *
 * Returns the first match rather than all of them: the notice names one
 * report, and a user comparing two copies does not need a third.
 */
export async function findLikelyDuplicate(
  db: Firestore,
  report: { id: string; ownerId: string; contentHash: string },
  fingerprint: ReportFingerprint,
): Promise<{ reportId: string; fileName: string; verdict: DuplicateVerdict } | null> {
  const reports = db.collection('reports');

  const queries = [
    report.contentHash
      ? reports.where('ownerId', '==', report.ownerId).where('contentHash', '==', report.contentHash)
      : null,
    fingerprint.reportDate
      ? reports
          .where('ownerId', '==', report.ownerId)
          .where('reportDate', '==', Timestamp.fromDate(new Date(`${fingerprint.reportDate}T00:00:00Z`)))
      : reports
          .where('ownerId', '==', report.ownerId)
          .orderBy('uploadedAt', 'desc')
          .limit(UNDATED_SCAN),
  ].filter((query): query is Query => query !== null);

  const snapshots = await Promise.all(queries.map((query) => query.get()));

  const candidates = new Map<string, DocumentData>();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      // Itself, obviously. And a report that never finished has no results to
      // compare, so it can only ever match on hash — which the first query
      // already answers.
      if (doc.id === report.id) continue;
      candidates.set(doc.id, doc.data());
    }
  }

  for (const [id, data] of [...candidates].slice(0, MAX_CANDIDATES)) {
    const identicalFile =
      report.contentHash !== '' && data.contentHash === report.contentHash;

    const verdict = judgeDuplicate(
      fingerprint,
      {
        reportDate: dateKey(data.reportDate),
        laboratoryName: (data.laboratoryName as string | null) ?? null,
        // Only read when a verdict could still turn on it. An identical hash
        // is already decided, and the whole point of the cap above is that
        // this read is the expensive part.
        entries: identicalFile ? [] : await readFingerprintEntries(db, id),
      },
      identicalFile,
    );

    if (verdict.isDuplicate) {
      return {
        reportId: id,
        fileName: String(data.originalFileName ?? 'another report'),
        verdict,
      };
    }
  }

  return null;
}

async function readFingerprintEntries(
  db: Firestore,
  reportId: string,
): Promise<FingerprintEntry[]> {
  const snapshot = await db.collection('reports').doc(reportId).collection('results').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      variableId: String(data.variableId ?? ''),
      value: typeof data.value === 'number' ? data.value : null,
      rawValue: String(data.rawValue ?? ''),
    };
  });
}

/** `YYYY-MM-DD` in UTC — the same key the fingerprint uses. */
export function dateKey(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString().slice(0, 10);
  return null;
}

/**
 * The sentence written onto the report.
 *
 * Composed here, in English, for the same reason every other pipeline message
 * is (see `copy.ts`): this code has no locale to compose in. It says what was
 * found and leaves the decision open, because the decision is not ours.
 */
export function duplicateNotice(otherFileName: string): string {
  return `This report looks like one you already have (${otherFileName}). Nothing has been removed — both are kept until you decide. Open Reports to compare them and delete either one if it is a duplicate.`;
}

export const DUPLICATE_WARNING_CODE = 'duplicate/likely';
