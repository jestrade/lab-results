/**
 * Saying *why* a report failed, in the reader's language (KAN-7, KAN-8).
 *
 * The pipeline writes both a code and a sentence on every warning. The
 * sentence is English whatever the reader chose, because it is written where
 * there is no locale to write it in; the code is stable, and this table is
 * what turns it back into a translated sentence.
 *
 * Codes with no entry fall back to the pipeline's own words rather than to a
 * generic apology: a duplicate notice names the other file and a quota
 * refusal names the allowance, and an English sentence that says something
 * beats a Spanish one that says nothing.
 */

import type { Locale } from './locales';
import type { ReportWarning } from './types';
import { messageFor } from '@/i18n/catalogs';
import type { MessageKey } from '@/i18n/messages';

const WARNING_KEYS: Record<string, MessageKey> = {
  'consent/ai-processing-missing': 'warning.consent.missing',
  'extraction/no-text-layer': 'warning.extraction.noTextLayer',
  'extraction/unreadable': 'warning.extraction.unreadable',
  // One per AI failure cause. They differ in the only way that matters to
  // someone looking at a report that did not work: whether waiting helps,
  // whether the file is at fault, and whether pressing retry is worth it.
  'extraction/rate-limited': 'warning.extraction.rateLimited',
  'extraction/timeout': 'warning.extraction.timeout',
  'extraction/unavailable': 'warning.extraction.unavailable',
  'extraction/unauthenticated': 'warning.extraction.unauthenticated',
  'extraction/blocked': 'warning.extraction.blocked',
  'extraction/truncated': 'warning.extraction.truncated',
  'extraction/invalid-response': 'warning.extraction.invalidResponse',
  'extraction/unknown': 'warning.extraction.unknown',
  'storage/object-missing': 'warning.storage.objectMissing',
  'processing/unexpected-error': 'warning.processing.unexpected',
};

/** The sentence to show for a warning: translated when we know the cause. */
export function warningText(warning: ReportWarning, locale: Locale): string {
  const key = WARNING_KEYS[warning.code];
  return key ? messageFor(locale, key) : warning.message;
}
