/**
 * Turning an uploaded PDF into structured results (KAN-5, KAN-6).
 *
 * ── Why the PDF itself is never sent to the model ─────────────────────────
 *
 * Gemini can read a PDF directly, and doing so would extract better. We do not,
 * because the redaction guarantee cannot survive it: a PDF is binary, and the
 * patient's name, address and record number sit inside it where no redactor can
 * reach. The landing page says "Identifiers redacted before AI" and the consent
 * screen says the same thing.
 *
 * So the text comes out here, in our own process, and goes to the model through
 * `getAiProvider()` — which redacts it on the way. The cost is real: a scanned
 * report has no text layer and cannot be processed until OCR exists (KAN-5).
 * Those reports fail with an explanation rather than being quietly sent whole.
 */

import * as logger from 'firebase-functions/logger';
import { PDFParse } from 'pdf-parse';

import { getAiProvider } from './ai/registry';
import { RESULT_EXTRACTION } from './ai/prompts';
import { AiProviderError, type AiCallMetadata } from './ai/types';

/** Caps what one report can cost. Long enough for a 40-page panel. */
const MAX_TEXT_CHARS = 60_000;

export interface ExtractedResult {
  rawName: string;
  rawValue: string;
  unit?: string;
  referenceText?: string;
  referenceLow?: number;
  referenceHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractionOutput {
  laboratoryName?: string;
  reportDate?: string;
  results: ExtractedResult[];
}

export class NoTextLayerError extends Error {
  constructor() {
    super('The PDF contains no extractable text.');
    this.name = 'NoTextLayerError';
  }
}

export async function readPdfText(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const { text } = await parser.getText();
    const trimmed = (text ?? '').trim();
    // A scanned report parses fine and yields nothing. That is not an error in
    // the file, it is a missing capability on our side, and the distinction
    // matters for what the user gets told.
    if (trimmed.length < 20) throw new NoTextLayerError();
    return trimmed.slice(0, MAX_TEXT_CHARS);
  } finally {
    await parser.destroy?.();
  }
}

/**
 * Response schema for structured extraction.
 *
 * Every optional field is `required` AND `nullable`, which looks redundant and
 * is not. With merely-optional fields Gemini emits an arbitrary subset: in
 * testing it returned `referenceLow` for every row and silently omitted
 * `referenceHigh` for all of them. The consequence was not a missing field, it
 * was a **potassium of 6.3 against a range of 3.5–5.1 classified as normal** —
 * a critical result reading as unremarkable, which is the worst failure this
 * product can produce.
 *
 * Requiring the field forces the model to emit it; making it nullable lets it
 * say "absent" honestly instead of inventing a bound. `propertyOrdering` keeps
 * the output stable across calls.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    laboratoryName: { type: 'string', nullable: true },
    reportDate: { type: 'string', nullable: true },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rawName: { type: 'string' },
          rawValue: { type: 'string' },
          unit: { type: 'string', nullable: true },
          referenceText: { type: 'string', nullable: true },
          referenceLow: { type: 'number', nullable: true },
          referenceHigh: { type: 'number', nullable: true },
          criticalLow: { type: 'number', nullable: true },
          criticalHigh: { type: 'number', nullable: true },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: [
          'rawName',
          'rawValue',
          'unit',
          'referenceText',
          'referenceLow',
          'referenceHigh',
          'criticalLow',
          'criticalHigh',
          'confidence',
        ],
        propertyOrdering: [
          'rawName',
          'rawValue',
          'unit',
          'referenceText',
          'referenceLow',
          'referenceHigh',
          'criticalLow',
          'criticalHigh',
          'confidence',
        ],
      },
    },
  },
  required: ['laboratoryName', 'reportDate', 'results'],
} as const;

/**
 * Validates the model's output rather than trusting it.
 *
 * Structured output constrains the shape, it does not guarantee it — and this
 * is the boundary where a model's guess stops being a string and starts being
 * a laboratory result. Rows that fail validation are dropped and counted, which
 * is what produces `partially_processed` rather than a silently short report.
 */
export function parseExtraction(raw: unknown): { output: ExtractionOutput; dropped: number } {
  const value = raw as Partial<ExtractionOutput>;
  if (!Array.isArray(value?.results)) {
    throw new AiProviderError('Extraction returned no results array', 'invalid-response');
  }

  let dropped = 0;
  const results: ExtractedResult[] = [];

  for (const row of value.results as Partial<ExtractedResult>[]) {
    const name = typeof row?.rawName === 'string' ? row.rawName.trim() : '';
    const printed = typeof row?.rawValue === 'string' ? row.rawValue.trim() : '';
    if (!name || !printed) {
      dropped += 1;
      continue;
    }

    const confidence =
      row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
        ? row.confidence
        : 'low';

    results.push({
      rawName: name,
      rawValue: printed,
      ...(typeof row.unit === 'string' && row.unit.trim() ? { unit: row.unit.trim() } : {}),
      ...(typeof row.referenceText === 'string' && row.referenceText.trim()
        ? { referenceText: row.referenceText.trim() }
        : {}),
      ...numeric('referenceLow', row.referenceLow),
      ...numeric('referenceHigh', row.referenceHigh),
      ...numeric('criticalLow', row.criticalLow),
      ...numeric('criticalHigh', row.criticalHigh),
      confidence,
    });
  }

  return {
    output: {
      ...(typeof value.laboratoryName === 'string' && value.laboratoryName.trim()
        ? { laboratoryName: value.laboratoryName.trim() }
        : {}),
      ...(typeof value.reportDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.reportDate)
        ? { reportDate: value.reportDate }
        : {}),
      results,
    },
    dropped,
  };
}

function numeric(key: string, value: unknown): Record<string, number> {
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } : {};
}

/**
 * What went wrong, in a sentence the person who uploaded the file can act on.
 *
 * One entry per cause, because "please try again later" is the wrong advice
 * for half of them: a rate limit clears in minutes, a rejected API key never
 * clears on its own, and a response cut off at the token limit will be cut off
 * again at exactly the same place unless the report gets smaller. The code
 * travels with the message so the web app can show its own translation of the
 * same cause (`src/domain/reportWarnings.ts`) and so `config/retry.json` can
 * decide, per cause, whether a retry is worth offering.
 */
const EXTRACTION_FAILURE_MESSAGES: Record<string, string> = {
  'rate-limited':
    'Our AI provider is over its request limit right now, so nothing could be read from ' +
    'this report. Nothing is wrong with your file — wait a few minutes and try again.',
  timeout:
    'Our AI provider did not answer in time, so nothing could be read from this report. ' +
    'This usually clears on its own — try again in a few minutes.',
  unavailable:
    'Our AI provider is unavailable right now, so nothing could be read from this report. ' +
    'Try again in a few minutes.',
  unauthenticated:
    'Our AI provider rejected our credentials, so nothing could be read from this report. ' +
    'This is a fault on our side, not with your file, and retrying will not help until we fix it.',
  blocked:
    "Our AI provider's safety filters stopped part-way through this report, so nothing was " +
    'extracted. This is usually a false alarm on clinical wording; trying again may work.',
  truncated:
    'This report holds more results than one reading pass allows: the model reached its ' +
    'output limit before finishing, so no results were saved. Try uploading it split into ' +
    'fewer pages.',
  'invalid-response':
    'Our AI provider returned an answer we could not read as laboratory results, so nothing ' +
    'was extracted. Trying again often works.',
  unknown:
    'Nothing could be read from this report because of an unexpected fault on our side. ' +
    'Please try again later.',
};

/** The warning to write on a report whose extraction call failed. */
export function describeExtractionFailure(error: unknown): { code: string; message: string } {
  const cause = error instanceof AiProviderError ? error.code : 'unknown';
  return {
    code: `extraction/${cause}`,
    message: EXTRACTION_FAILURE_MESSAGES[cause] ?? EXTRACTION_FAILURE_MESSAGES.unknown!,
  };
}

export interface ExtractionResult {
  output: ExtractionOutput;
  dropped: number;
  metadata: AiCallMetadata;
}

export async function extractResults(reportText: string): Promise<ExtractionResult> {
  const provider = getAiProvider();
  let dropped = 0;

  const { data, metadata } = await provider.generate<ExtractionOutput>({
    prompt: RESULT_EXTRACTION,
    input: reportText,
    responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    parse: (raw) => {
      const parsed = parseExtraction(raw);
      dropped = parsed.dropped;
      return parsed.output;
    },
    maxOutputTokens: 8192,
  });

  logger.info('Extraction complete', {
    results: data.results.length,
    dropped,
    tokens: metadata.usage.totalTokens,
  });

  return { output: data, dropped, metadata };
}
