/**
 * Regulated copy (KAN-22).
 *
 * These strings are quoted verbatim from the product spec (§26, §40.10, §46).
 * They are legal text, not UI copy: do not reword, shorten or "improve" them,
 * and do not interpolate anything into them. Everywhere the app needs to say
 * one of these things, it imports it from here so there is exactly one wording
 * to review and one place to update when Legal revises it.
 */

/** Spec §26 — the full medical disclaimer. */
export const MEDICAL_DISCLAIMER =
  'This application provides AI-generated informational analysis of laboratory ' +
  'results for educational purposes only. It is not a medical device and does ' +
  'not provide medical diagnoses, treatment recommendations, or professional ' +
  'medical advice. AI-generated information may be incomplete or inaccurate and ' +
  'should not be used as a substitute for consultation with a qualified ' +
  'healthcare professional. Always discuss your laboratory results and health ' +
  'concerns with your doctor or another qualified healthcare provider.';

/** Spec §46 — shown whenever a result is classified `critical`. */
export const CRITICAL_RESULT_NOTICE =
  'This result is outside the expected range and may require prompt medical ' +
  'attention. Please contact your healthcare provider or follow the ' +
  'instructions provided by the laboratory.';

/** Spec §40.10 — shown on a report with status `partially_processed`. */
export const PARTIAL_PROCESSING_NOTICE =
  'We successfully extracted most results from this report, but some values ' +
  'could not be reliably identified.';

/**
 * Short form for the in-app banner, where the full §26 text would crowd out
 * the page. It always sits next to a link to the full disclaimer — the short
 * form never appears on its own.
 */
export const MEDICAL_DISCLAIMER_SHORT =
  'Informational only. This application provides AI-generated analysis of ' +
  'laboratory results for educational purposes. It is not a medical device and ' +
  'does not provide medical diagnoses, treatment recommendations, or ' +
  'professional medical advice. Always discuss your results with a qualified ' +
  'healthcare professional.';

/** Version of the legal documents currently in force, recorded on consent. */
export const DOCUMENTS_VERSION = '2026-07-01';
