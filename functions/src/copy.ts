/**
 * Regulated copy, server side (spec §26, §40.10, §46).
 *
 * Duplicated from `src/domain/disclaimers.ts` in the web app because the two
 * packages do not share a module graph. Both copies are pinned by tests to the
 * exact spec wording, so they cannot drift apart silently — see
 * `copy.test.ts` here and `disclaimers.test.ts` there.
 */

/** Spec §46 — appended to any analysis of a critical result. */
export const CRITICAL_RESULT_NOTICE =
  'This result is outside the expected range and may require prompt medical ' +
  'attention. Please contact your healthcare provider or follow the ' +
  'instructions provided by the laboratory.';

/** Spec §40.10 — set as a warning on a partially processed report. */
export const PARTIAL_PROCESSING_NOTICE =
  'We successfully extracted most results from this report, but some values ' +
  'could not be reliably identified.';
