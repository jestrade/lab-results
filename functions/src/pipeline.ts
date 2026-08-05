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
import { extractResults, NoTextLayerError, readPdfText } from './extraction';
import { calculateTrend, mergePoints, variableKey } from './trends';
import { AiProviderError } from './ai/types';

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

  await setStatus(report.id, { status: 'processing' });

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
    const code = error instanceof AiProviderError ? error.code : 'unknown';
    logger.error('Extraction failed', { reportId: report.id, code });
    await setStatus(report.id, {
      status: 'failed',
      warnings: [
        {
          code: `extraction/${code}`,
          message:
            'We could not read the results from this report. Nothing was extracted — please try again later.',
        },
      ],
    });
    return;
  }

  // ── classification: arithmetic, in code, never the model ────────────────
  const classified = extraction.output.results.map((row, index) => {
    const range = rangeFrom(row);
    const value = parseValue(row.rawValue);
    return {
      // Document id keeps report order for the details page; variableId is the
      // cross-report identity the trend engine groups on.
      id: `${String(index).padStart(3, '0')}-${variableKey(row.rawName)}`,
      variableId: variableKey(row.rawName),
      row,
      range,
      value,
      status: classify({ value, rawValue: row.rawValue, range }),
    };
  });

  // One instant for the whole report, so every result from it lines up on the
  // time axis. The report's own date when the laboratory printed one, falling
  // back to when it was uploaded.
  const observedAt = extraction.output.reportDate
    ? new Date(`${extraction.output.reportDate}T00:00:00Z`)
    : new Date();

  const batch = db.batch();
  const resultsRef = db.collection('reports').doc(report.id).collection('results');
  for (const entry of classified) {
    batch.set(resultsRef.doc(entry.id), {
      // The canonical variable catalog (KAN-8) does not exist yet, so a
      // normalised form of the printed name is the identity. When the catalog
      // lands, alias resolution plugs in here — rawName is what it matches on.
      variableId: entry.variableId,
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

  // ── analysis: only where it adds something ──────────────────────────────
  const worthAnalysing = classified
    .filter((entry) => needsAnalysis(entry.status))
    .slice(0, MAX_ANALYSES_PER_REPORT);

  let analysed = 0;
  for (const entry of worthAnalysing) {
    const analysis = await analyseResult({
      canonicalName: entry.row.rawName,
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

  await setStatus(report.id, {
    status: partial ? 'partially_processed' : 'processed',
    resultCount: classified.length,
    outOfRangeCount: outOfRange,
    laboratoryName: extraction.output.laboratoryName ?? null,
    reportDate: extraction.output.reportDate
      ? new Date(`${extraction.output.reportDate}T00:00:00Z`)
      : null,
    processedAt: FieldValue.serverTimestamp(),
    warnings: partial
      ? [{ code: 'extraction/partial', message: PARTIAL_PROCESSING_NOTICE }]
      : [],
  });

  logger.info('Report processed', {
    reportId: report.id,
    results: classified.length,
    outOfRange,
    analysed,
    dropped: extraction.dropped,
  });
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
    variableId: string;
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
        .doc(entry.variableId);

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
            variableId: entry.variableId,
            canonicalName: entry.row.rawName,
            aliases: [],
            category: 'other',
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
