/**
 * Regulated copy (KAN-22).
 *
 * These strings are quoted verbatim from the product spec (§26, §40.10, §46).
 * They are legal text, not UI copy: do not reword, shorten or "improve" them,
 * and do not interpolate anything into them. Everywhere the app needs to say
 * one of these things, it imports it from here so there is exactly one wording
 * to review and one place to update when Legal revises it.
 *
 * ── The Spanish versions (KAN-8) ──────────────────────────────────────────
 *
 * ⚠ NOT YET REVIEWED BY LEGAL. They are here rather than absent because the
 * alternative is worse: a disclaimer exists to make sure the reader
 * understands what the product is not, and one printed in a language they
 * cannot read discharges nothing. An unreviewed translation that communicates
 * beats a reviewed one that does not.
 *
 * They are translations of the English, and the English remains the version of
 * record — kept byte-identical to the spec above, and the one the consent
 * timestamp in `users/{uid}.consents` refers to. Before this ships to Spanish
 * users in earnest, whoever carries the legal risk has to sign these off, and
 * `DOCUMENTS_VERSION` has to move when they do.
 *
 * The same texts exist server-side in `functions/src/copy.ts`, where the
 * pipeline embeds them into stored report content. Those are still English
 * only; see the note there.
 */

import type { Locale } from './locales';

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

/** Spec §26, in Spanish. Pending legal review — see the note at the top. */
export const MEDICAL_DISCLAIMER_ES =
  'Esta aplicación ofrece un análisis informativo de resultados de laboratorio ' +
  'generado por inteligencia artificial, con fines exclusivamente educativos. ' +
  'No es un producto sanitario y no proporciona diagnósticos médicos, ' +
  'recomendaciones de tratamiento ni asesoramiento médico profesional. La ' +
  'información generada por inteligencia artificial puede ser incompleta o ' +
  'inexacta y no debe utilizarse como sustituto de la consulta con un ' +
  'profesional sanitario cualificado. Consulte siempre sus resultados de ' +
  'laboratorio y sus problemas de salud con su médico o con otro profesional ' +
  'sanitario cualificado.';

/** Spec §46, in Spanish. Pending legal review. */
export const CRITICAL_RESULT_NOTICE_ES =
  'Este resultado se encuentra fuera del intervalo esperado y puede requerir ' +
  'atención médica sin demora. Póngase en contacto con su profesional sanitario ' +
  'o siga las instrucciones facilitadas por el laboratorio.';

/** Spec §40.10, in Spanish. Pending legal review. */
export const PARTIAL_PROCESSING_NOTICE_ES =
  'Se han extraído correctamente la mayoría de los resultados de este reporte, ' +
  'pero algunos valores no se han podido identificar de forma fiable.';

/** Short form, in Spanish. Pending legal review. */
export const MEDICAL_DISCLAIMER_SHORT_ES =
  'Solo con fines informativos. Esta aplicación ofrece un análisis de ' +
  'resultados de laboratorio generado por inteligencia artificial, con fines ' +
  'educativos. No es un producto sanitario y no proporciona diagnósticos ' +
  'médicos, recomendaciones de tratamiento ni asesoramiento médico ' +
  'profesional. Consulte siempre sus resultados con un profesional sanitario ' +
  'cualificado.';

/**
 * The locale-keyed views the components read.
 *
 * The individual constants above stay exported and unchanged, because the
 * tests that pin them to the spec, and the server that has no locale to work
 * with, both address the English text by name.
 */
export const MEDICAL_DISCLAIMER_BY_LOCALE: Record<Locale, string> = {
  en: MEDICAL_DISCLAIMER,
  es: MEDICAL_DISCLAIMER_ES,
};

export const MEDICAL_DISCLAIMER_SHORT_BY_LOCALE: Record<Locale, string> = {
  en: MEDICAL_DISCLAIMER_SHORT,
  es: MEDICAL_DISCLAIMER_SHORT_ES,
};

export const CRITICAL_RESULT_NOTICE_BY_LOCALE: Record<Locale, string> = {
  en: CRITICAL_RESULT_NOTICE,
  es: CRITICAL_RESULT_NOTICE_ES,
};

export const PARTIAL_PROCESSING_NOTICE_BY_LOCALE: Record<Locale, string> = {
  en: PARTIAL_PROCESSING_NOTICE,
  es: PARTIAL_PROCESSING_NOTICE_ES,
};

/** Version of the legal documents currently in force, recorded on consent. */
export const DOCUMENTS_VERSION = '2026-07-01';
