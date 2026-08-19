/**
 * Report processing (KAN-5, KAN-6, KAN-7, KAN-10, KAN-16).
 *
 * Runs when an uploaded object survives the capacity checks. The order is the
 * design:
 *
 *   1. consent — refuse to send anything without it
 *   2. text    — extracted here, in our process, so redaction can apply
 *   3. extract — the model reads values; it is not asked to interpret them
 *   4. classify— arithmetic, in code, against the range on this report
 *   5. store   — results written by the Admin SDK, closed to clients
 *   6. analyse — commentary on results already classified, out-of-range only
 *
 * Step 1 is a hard gate rather than a check the caller can skip, and step 4
 * sits between the model and the user so that no model output can decide
 * whether a value is normal.
 */

import * as logger from 'firebase-functions/logger';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { analyseResult, needsAnalysis } from './analysis';
import { classify, isOutOfRange, parseValue, type ReferenceRange } from './classification';
import { PARTIAL_PROCESSING_NOTICE } from './copy';
import {
  DUPLICATE_WARNING_CODE,
  duplicateNotice,
  findLikelyDuplicate,
} from './duplicates';
import {
  describeExtractionFailure,
  extractResults,
  NoTextLayerError,
  readPdfText,
} from './extraction';
import { calculateTrend, mergePoints } from './trends';
import { resolveVariables, type ResolvedVariable } from './variables/catalog';
import { enrichVariables } from './variables/enrichment';

/** Bounded so one pathological report cannot spend the month's AI budget. */
const MAX_ANALYSES_PER_REPORT = 12;

interface ReportRef {
  id: string;
  ownerId: string;
  storagePath: string;
  bucket: string;
}

/**
 * Has this account agreed to third-party AI processing?
 *
 * Checked server-side even though the upload page gates on it too. The client
 * gate is what makes the requirement visible; this one is what makes it true.
 * A Google sign-up never passes through the registration form, so "they must
 * have agreed at some point" is not a safe assumption.
 */
async function hasAiConsent(ownerId: string): Promise<boolean> {
  const snap = await getFirestore().collection('users').doc(ownerId).get();
  return snap.data()?.consents?.aiProcessingAcceptedAt != null;
}

async function setStatus(
  reportId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await getFirestore().collection('reports').doc(reportId).set(fields, { merge: true });
}

/**
 * The day the user said these tests were taken.
 *
 * Written by the browser when the record was created and required there since
 * the upload form began asking for it (see `src/domain/reportDate.ts`). This
 * pipeline used to decide the date itself, from whichever of the several dates
 * printed on a laboratory report the model happened to pick — and when it
 * picked wrong, every value on the report landed on the wrong day of the
 * reader's history with nothing to reveal it. The person holding the paper
 * knows; we ask them, and then we do not argue.
 *
 * Null only for reports stored before the field existed. Those still fall back
 * to the extracted date, which is better than nothing and is all they ever had.
 */
async function readDeclaredDate(reportId: string): Promise<Date | null> {
  const snap = await getFirestore().collection('reports').doc(reportId).get();
  const stamp = snap.data()?.reportDate as { toDate?: () => Date } | null | undefined;
  return stamp?.toDate ? stamp.toDate() : null;
}

function rangeFrom(row: {
  referenceLow?: number;
  referenceHigh?: number;
  referenceText?: string;
  criticalLow?: number;
  criticalHigh?: number;
}): ReferenceRange {
  const hasBounds = row.referenceLow !== undefined || row.referenceHigh !== undefined;
  const hasText = typeof row.referenceText === 'string' && row.referenceText.trim() !== '';

  return {
    low: row.referenceLow ?? null,
    high: row.referenceHigh ?? null,
    text: hasText ? row.referenceText!.trim() : null,
    // The source is what the report gave us. We never mark a range as
    // laboratory-provided unless the report actually printed one, because that
    // label is what tells the user how much to trust it (spec §40.6).
    source: hasBounds || hasText ? 'laboratory' : 'unavailable',
    criticalLow: row.criticalLow ?? null,
    criticalHigh: row.criticalHigh ?? null,
  };
}

function describeRange(range: ReferenceRange): string {
  if (range.text) return range.text;
  if (range.low !== null && range.high !== null) return `${range.low}–${range.high}`;
  if (range.high !== null) return `< ${range.high}`;
  if (range.low !== null) return `> ${range.low}`;
  return 'not stated on this report';
}

export async function processReport(report: ReportRef): Promise<void> {
  const db = getFirestore();

  if (!(await hasAiConsent(report.ownerId))) {
    logger.warn('Processing refused: no AI-processing consent', { reportId: report.id });
    await setStatus(report.id, {
      status: 'failed',
      warnings: [
        {
          code: 'consent/ai-processing-missing',
          message:
            'This report was not processed because you have not agreed to AI processing. Open the upload page to review and agree, then upload it again.',
        },
      ],
    });
    return;
  }

  // Read before this run writes anything, so a reprocessing reads the user's
  // declaration rather than whatever the previous attempt left behind.
  const declaredDate = await readDeclaredDate(report.id);

  // The instant matters as much as the status: a run that dies without writing
  // an outcome leaves the report here forever, and `retry.ts` uses the age of
  // this stamp to tell "still working" apart from "lost its worker".
  await setStatus(report.id, {
    status: 'processing',
    processingStartedAt: FieldValue.serverTimestamp(),
  });

  let text: string;
  try {
    const [bytes] = await getStorage().bucket(report.bucket).file(report.storagePath).download();
    text = await readPdfText(bytes);
  } catch (error) {
    const scanned = error instanceof NoTextLayerError;
    logger.warn('Could not read report text', { reportId: report.id, scanned });
    await setStatus(report.id, {
      status: 'failed',
      warnings: [
        scanned
          ? {
              code: 'extraction/no-text-layer',
              message:
                'This looks like a scanned report. Reading scanned pages is not supported yet — please upload a PDF exported from the laboratory rather than a photograph or scan.',
            }
          : {
              code: 'extraction/unreadable',
              message:
                'This PDF could not be opened. It may be password-protected or damaged. Try uploading an unprotected copy.',
            },
      ],
    });
    return;
  }

  let extraction;
  try {
    extraction = await extractResults(text);
  } catch (error) {
    // The reason, not just the fact. "Try again later" is advice the user can
    // only follow blindly; "the provider is rate-limited" tells them whether
    // waiting is the answer, whether their file is at fault, and whether it is
    // worth pressing retry at all. `describeExtractionFailure` owns the wording
    // per cause, and the code it returns is what the UI translates.
    const failure = describeExtractionFailure(error);
    logger.error('Extraction failed', { reportId: report.id, code: failure.code });
    await setStatus(report.id, {
      status: 'failed',
      warnings: [failure],
    });
    return;
  }

  // ── identity: which catalog variable is each printed name? ──────────────
  //
  // Resolved in one pass over the whole report rather than per row, so that
  // two spellings of one test on the same report ("Glucosa" and "Glucose")
  // reach the same variable instead of racing to create two.
  const { resolved, created } = await resolveVariables(
    extraction.output.results.map((row) => row.rawName),
  );

  // ── classification: arithmetic, in code, never the model ────────────────
  const classified = extraction.output.results.map((row, index) => {
    const range = rangeFrom(row);
    const value = parseValue(row.rawValue);
    const variable = resolved.get(row.rawName)!;
    return {
      // Document id keeps report order for the details page; variableId is the
      // cross-report identity the trend engine groups on.
      id: `${String(index).padStart(3, '0')}-${variable.variableId}`,
      variable,
      row,
      range,
      value,
      status: classify({ value, rawValue: row.rawValue, range }),
    };
  });

  // What the model read off the page. Kept, but no longer authoritative: it is
  // stored beside the user's date as evidence, not in place of it.
  const extractedDate = extraction.output.reportDate
    ? new Date(`${extraction.output.reportDate}T00:00:00Z`)
    : null;

  // One instant for the whole report, so every result from it lines up on the
  // time axis. The user's declared date first, the extracted one only for the
  // reports that predate the form asking, and the clock only when neither
  // exists.
  const observedAt = declaredDate ?? extractedDate ?? new Date();

  const batch = db.batch();
  const resultsRef = db.collection('reports').doc(report.id).collection('results');
  for (const entry of classified) {
    batch.set(resultsRef.doc(entry.id), {
      // Identity comes from the catalog (KAN-8), which `resolveVariables`
      // matched `rawName` against. `rawName` stays alongside it because the
      // details page shows what the laboratory actually printed, and because
      // it is the evidence for why this row was filed where it was.
      variableId: entry.variable.variableId,
      rawName: entry.row.rawName,
      value: entry.value,
      rawValue: entry.row.rawValue,
      unit: entry.row.unit ?? null,
      referenceRange: {
        low: entry.range.low,
        high: entry.range.high,
        text: entry.range.text,
        source: entry.range.source,
      },
      status: entry.status,
      confidence: entry.row.confidence,
      sourcePage: null,
      observedAt: Timestamp.fromDate(observedAt),
    });
  }
  await batch.commit();

  // ── series: what makes /variables and /trends show anything ─────────────
  await updateSeries(report.ownerId, observedAt, classified);

  // ── catalog: give the tests we had never seen a name and an explanation ──
  //
  // After the series, deliberately. The user's values are already stored and
  // visible at this point, so a slow or failing provider costs them a card
  // that reads "Ferritina" instead of "Ferritin" — never a missing result.
  if (created.length > 0) {
    await enrichVariables(created);
  }

  // ── analysis: only where it adds something ──────────────────────────────
  const worthAnalysing = classified
    .filter((entry) => needsAnalysis(entry.status))
    .slice(0, MAX_ANALYSES_PER_REPORT);

  let analysed = 0;
  for (const entry of worthAnalysing) {
    const analysis = await analyseResult({
      // The catalog's name, not the laboratory's abbreviation: "HDL" alone
      // gives the model less to work with than "HDL cholesterol", and the
      // catalog is where the unabbreviated name lives.
      canonicalName: entry.variable.canonicalName,
      rawValue: entry.row.rawValue,
      ...(entry.row.unit ? { unit: entry.row.unit } : {}),
      rangeText: describeRange(entry.range),
      status: entry.status,
    });
    if (!analysis) continue;

    await resultsRef.doc(entry.id).set(
      {
        analysis: {
          text: analysis.text,
          // Provenance, so a future prompt change can find and regenerate
          // everything produced by the old one (KAN-17, KAN-49).
          provider: analysis.metadata.provider,
          model: analysis.metadata.model,
          promptVersion: analysis.metadata.promptVersion,
          contentUsedForTraining: analysis.metadata.contentUsedForTraining,
          generatedAt: analysis.metadata.generatedAt,
        },
      },
      { merge: true },
    );
    analysed += 1;
  }

  const outOfRange = classified.filter((entry) => isOutOfRange(entry.status)).length;
  const partial = extraction.dropped > 0;

  // ── duplicates: the half of KAN-28 the browser could not run ────────────
  //
  // Last, and never fatal. This is a notice about a report that has already
  // been processed and stored — the user's results are safe on the document
  // before we go looking for what they might duplicate, and a failure here
  // must not turn a processed report into a failed one.
  const duplicate = await findDuplicate(
    report,
    { ...extraction.output, reportDate: toDateKey(observedAt) },
    classified,
  ).catch((error) => {
    logger.warn('Duplicate check failed', { reportId: report.id, error });
    return null;
  });

  const warnings = [
    ...(partial ? [{ code: 'extraction/partial', message: PARTIAL_PROCESSING_NOTICE }] : []),
    ...(duplicate
      ? [{ code: DUPLICATE_WARNING_CODE, message: duplicateNotice(duplicate.fileName) }]
      : []),
  ];

  await setStatus(report.id, {
    status: partial ? 'partially_processed' : 'processed',
    resultCount: classified.length,
    outOfRangeCount: outOfRange,
    laboratoryName: extraction.output.laboratoryName ?? null,
    extractedReportDate: extractedDate,
    // Only ever filled in, never overwritten. A user who corrected the date on
    // this report and then pressed retry must not find their correction undone
    // by the same misreading that made them correct it.
    ...(declaredDate ? {} : { reportDate: extractedDate }),
    processedAt: FieldValue.serverTimestamp(),
    warnings,
    // The pointer, kept apart from the warning text so the reports UI can link
    // to the other report rather than parsing a sentence for a filename. Null
    // rather than absent on a clean run: a report that *was* flagged and is
    // reprocessed after the other copy is deleted has to be able to lose it.
    duplicateOf: duplicate?.reportId ?? null,
  });

  logger.info('Report processed', {
    reportId: report.id,
    results: classified.length,
    outOfRange,
    analysed,
    dropped: extraction.dropped,
    duplicateOf: duplicate?.reportId ?? null,
  });
}

/** `YYYY-MM-DD` of a date's UTC day — how `duplicates.ts` compares dates. */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds this report's fingerprint and looks for the report it duplicates.
 *
 * The incoming side is built from what is already in memory rather than read
 * back from Firestore: these are the same values that were just written, and a
 * re-read would be a subcollection fetch to learn what we already know.
 */
async function findDuplicate(
  report: ReportRef,
  output: { reportDate?: string | null; laboratoryName?: string | null },
  classified: { variable: ResolvedVariable; row: { rawValue: string }; value: number | null }[],
): Promise<{ reportId: string; fileName: string } | null> {
  const db = getFirestore();

  // The hash is the client's, written when the record was created; a report
  // from before hashing existed simply has no hash, and the content signals
  // carry the check on their own.
  const snap = await db.collection('reports').doc(report.id).get();
  const contentHash = String(snap.data()?.contentHash ?? '');

  const found = await findLikelyDuplicate(
    db,
    { id: report.id, ownerId: report.ownerId, contentHash },
    {
      reportDate: output.reportDate ?? null,
      laboratoryName: output.laboratoryName ?? null,
      entries: classified.map((entry) => ({
        variableId: entry.variable.variableId,
        value: entry.value,
        rawValue: entry.row.rawValue,
      })),
    },
  );

  if (!found) return null;

  logger.info('Possible duplicate report', {
    reportId: report.id,
    duplicateOf: found.reportId,
    signals: found.verdict.signals,
    similarity: Number(found.verdict.similarity.toFixed(3)),
  });

  return { reportId: found.reportId, fileName: found.fileName };
}

/**
 * Folds this report's results into the user's per-variable series (KAN-11).
 *
 * The series is a denormalised cache: the variables grid draws two dozen cards
 * and the trend page overlays several histories, and doing either from the raw
 * results would be a collection-group query plus a read per card. The results
 * on each report remain the record; this is the shape.
 *
 * Written by the Admin SDK only — `firestore.rules` denies every client write,
 * which is what lets the grid present a trend as computed rather than claimed.
 */
async function updateSeries(
  ownerId: string,
  observedAt: Date,
  classified: {
    variable: ResolvedVariable;
    row: { rawName: string; unit?: string };
    range: ReferenceRange;
    value: number | null;
    status: string;
  }[],
): Promise<void> {
  const db = getFirestore();
  const at = observedAt.getTime();

  await Promise.all(
    classified.map(async (entry) => {
      const ref = db
        .collection('users')
        .doc(ownerId)
        .collection('variableSeries')
        .doc(entry.variable.variableId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const existing = (snap.data()?.pointsRaw as { value: number; at: number }[]) ?? [];

        // A non-numeric result still updates the latest value and status, but
        // contributes no point — there is nothing to plot for "Negative".
        const points =
          entry.value === null ? existing : mergePoints(existing, { value: entry.value, at });

        const trend = calculateTrend({
          points,
          rangeLow: entry.range.low,
          rangeHigh: entry.range.high,
        });

        // Only overwrite "latest" when this report is at least as recent as
        // what is stored, so uploading an old report does not rewrite history
        // with a stale value.
        const storedLatestAt = (snap.data()?.latestAt as number | undefined) ?? -Infinity;
        const isNewest = at >= storedLatestAt;

        tx.set(
          ref,
          {
            variableId: entry.variable.variableId,
            // Copied from the catalog, not from the report. The card shows the
            // standard name of the test in the reader's language; `rawName`
            // stays on the result, where "what this laboratory called it"
            // belongs. Both are kept because they answer different questions.
            canonicalName: entry.variable.canonicalName,
            names: entry.variable.names,
            category: entry.variable.category,
            // Searchable by whatever this user's own reports printed, which is
            // the vocabulary they will actually type.
            aliases: FieldValue.arrayUnion(entry.row.rawName),
            resultCount: points.length,
            trend,
            pointsRaw: points,
            points: points.map((point) => ({
              value: point.value,
              observedAt: Timestamp.fromMillis(point.at),
            })),
            ...(isNewest
              ? {
                  unit: entry.row.unit ?? null,
                  latestValue: entry.value,
                  latestRawValue: String(entry.value ?? ''),
                  latestStatus: entry.status,
                  latestObservedAt: Timestamp.fromMillis(at),
                  latestAt: at,
                  referenceRange: {
                    low: entry.range.low,
                    high: entry.range.high,
                    text: entry.range.text,
                    source: entry.range.source,
                  },
                }
              : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    }),
  );
}
