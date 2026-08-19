/**
 * LabResults domain model (KAN-4).
 *
 * These types describe the documents the app reads and writes. They are the
 * TypeScript half of the contract that `firestore.rules` enforces at runtime —
 * when one changes, check the other.
 */

import type { Timestamp } from 'firebase/firestore';

import type { Locale, Translated } from './locales';
import type { ThemePreference } from './themes';

/** Where a value sits against the reference range on its own report. */
export type ResultStatus = 'low' | 'normal' | 'high' | 'critical' | 'unknown';

/** Lifecycle of an uploaded report as it moves through the pipeline. */
export type ReportStatus =
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'processed'
  | 'partially_processed'
  | 'failed';

/**
 * Direction of travel for a variable over time. Deliberately free of value
 * judgement — the spec forbids "good"/"bad" here, because whether a rising
 * value is welcome is a clinical question this app does not answer.
 */
export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';

/** How much the extraction pipeline trusts a value it read off the PDF. */
export type ExtractionConfidence = 'high' | 'medium' | 'low';

/** Where a reference range came from — it changes how it may be presented. */
export type ReferenceRangeSource =
  /** Printed on the report itself. Always wins when present. */
  | 'laboratory'
  /** From the general catalog; must be labelled "not lab-specific". */
  | 'general'
  /** None available; the result is shown as `unknown`, never guessed. */
  | 'unavailable';

export type UserRole = 'user' | 'admin';

/**
 * The panel a test belongs to.
 *
 * These are the groups a laboratory prints on a report, not a taxonomy of our
 * own — which is why `semen_analysis` and `coagulation` are here beside
 * `thyroid`, and why `iron_metabolism` is separate from `vitamins`: ferritin
 * and serum iron are iron studies, and a reader looking for them under
 * vitamins is a reader who cannot find their own result.
 *
 * `other` is the honest answer, never a dumping ground. The extraction
 * pipeline is told to choose it rather than guess (see `ai/prompts.ts`), and
 * an entry that stays there is one the catalog has not been taught yet.
 */
export type VariableCategory =
  | 'complete_blood_count'
  | 'coagulation'
  | 'lipid_profile'
  | 'glucose_metabolism'
  | 'liver_function'
  | 'kidney_function'
  | 'thyroid'
  | 'electrolytes'
  | 'iron_metabolism'
  | 'vitamins'
  | 'hormones'
  | 'inflammation'
  | 'allergy'
  | 'tumour_markers'
  | 'urinalysis'
  | 'faecal'
  | 'semen_analysis'
  | 'other';

/** `users/{uid}` */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  /**
   * Mirror of the `role` custom claim, for display only. The claim is the
   * source of truth; the rules forbid the user from writing this field.
   */
  role: UserRole;
  disabled: boolean;
  consents: UserConsents;
  preferences: UserPreferences;
  /** Optional context the user chose to give. Absent until they fill it in. */
  healthContext: HealthContext | null;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  deletedAt: Timestamp | null;
}

export type BiologicalSex = 'female' | 'male' | 'intersex';
export type PregnancyStatus = 'not_pregnant' | 'pregnant' | 'postpartum';

/**
 * Optional context about the person the results belong to (KAN-27, spec §51).
 *
 * Every field is nullable and stays null until the user supplies it. Nothing
 * here is inferred, defaulted, or carried over from anywhere else — a guessed
 * value in this record would be indistinguishable from one the user stated.
 *
 * Only attributes that are stable between blood draws live here. Fasting
 * status is deliberately absent: it is a property of a single draw, not of a
 * person, and a profile-level "fasting: yes" would silently attach itself to
 * every future non-fasting report. It belongs on the upload form.
 */
export interface HealthContext {
  /** ISO `YYYY-MM-DD`. Stored rather than an age, which goes stale in silence. */
  dateOfBirth: string | null;
  /** Asked because many reference ranges differ by sex, not for demographics. */
  biologicalSex: BiologicalSex | null;
  pregnancyStatus: PregnancyStatus | null;
  /** Free text — one per line, as the user writes them. Never parsed. */
  medications: string | null;
  conditions: string | null;
  ongoingSymptoms: string | null;
  updatedAt: Timestamp | null;
}

export interface UserConsents {
  /** Terms of Service + Privacy Policy, accepted together at registration. */
  termsAcceptedAt: Timestamp | null;
  /** Separate, explicit consent to third-party AI processing of report text. */
  aiProcessingAcceptedAt: Timestamp | null;
  /** Version of the documents that were accepted, so re-consent can be asked. */
  documentsVersion: string;
}

export interface UserPreferences {
  /** Email when a report finishes processing. */
  notifyOnProcessed: boolean;
  /** Email when a result is classified critical. */
  notifyOnCritical: boolean;
  /**
   * Chosen interface language (KAN-8).
   *
   * Optional because profiles created before the picker existed do not carry
   * it, and because "never chose" and "chose English" are different states:
   * the first still follows the browser, the second does not. Storing a
   * default here would quietly override the browser preference of every
   * existing account with English.
   */
  locale?: Locale;
  /**
   * Chosen colour theme.
   *
   * Optional for the same reason `locale` is: profiles created before the
   * picker existed do not carry it, and "never chose" has to keep following
   * the device. Note that `system` is a stored value here, not the absence of
   * one — a reader can deliberately choose to follow their device after having
   * chosen dark, and that is a different state from never having chosen.
   */
  theme?: ThemePreference;
}

/** `reports/{reportId}` */
export interface Report {
  id: string;
  ownerId: string;
  storagePath: string;
  originalFileName: string;
  fileSize: number;
  /** SHA-256 of the file bytes, used for duplicate detection (KAN-28). */
  contentHash: string;
  status: ReportStatus;
  /** Date the laboratory issued the report — extracted, so absent until then. */
  reportDate: Timestamp | null;
  laboratoryName: string | null;
  /** Optional free-text label the user typed on the upload form. */
  userLabel: string | null;
  pageCount: number | null;
  resultCount: number | null;
  outOfRangeCount: number | null;
  /** Non-fatal problems found while processing, shown as inline alerts. */
  warnings: ReportWarning[];
  uploadedAt: Timestamp;
  processedAt: Timestamp | null;
  /**
   * When the current processing attempt began (KAN-7). Optional because
   * reports uploaded before reprocessing existed do not carry it — and on an
   * in-flight status, its absence is itself the signal that the run is lost.
   */
  processingStartedAt?: Timestamp | null;
  /** Reprocessing attempts spent. Capped by `config/retry.json`. */
  retryCount?: number;
  lastRetryAt?: Timestamp | null;
  /** Set when a later upload supersedes this one (KAN-31). */
  supersededBy: string | null;
  /**
   * The report this one appears to duplicate (KAN-28).
   *
   * Written by the pipeline, never by the client. A pointer rather than a flag
   * so the interface can link to the other report; both copies are kept, and
   * removing either is the user's decision alone (spec §40.2). Optional
   * because reports processed before the check existed do not carry it.
   */
  duplicateOf?: string | null;
  version: number;
}

export interface ReportWarning {
  code: string;
  message: string;
}

/** `reports/{reportId}/results/{resultId}` */
export interface LabResult {
  id: string;
  /** Canonical variable this value was matched to (KAN-8). */
  variableId: string;
  /** The test name exactly as printed on the report. */
  rawName: string;
  value: number | null;
  /** Preserved verbatim when the result is not numeric ("Negative", "Trace"). */
  rawValue: string;
  unit: string | null;
  referenceRange: ReferenceRange;
  status: ResultStatus;
  confidence: ExtractionConfidence;
  /** Page of the source PDF, for the viewer to jump to (KAN-44). */
  sourcePage: number | null;
  /** When the sample was taken, falling back to the report date. */
  observedAt: Timestamp;
  /** Commentary generated for this value, when any was (KAN-17). */
  analysis?: ResultAnalysis | null;
}

/**
 * AI commentary on a single result (KAN-17).
 *
 * Provenance travels with the text, so the interface can label it honestly and
 * a later prompt change can find what the old one produced. It lives here
 * rather than beside the page that first rendered it because two screens now
 * show the same field — one report's results, and one variable's history.
 */
export interface ResultAnalysis {
  text: string;
  provider: string;
  model: string;
  promptVersion: string;
  contentUsedForTraining: boolean;
  generatedAt: string;
}

export interface ReferenceRange {
  low: number | null;
  high: number | null;
  /**
   * The range as printed, kept verbatim. Textual ranges ("Negative",
   * "< 5.7 %") cannot be reduced to low/high and must still be shown.
   */
  text: string | null;
  source: ReferenceRangeSource;
}

/**
 * `users/{userId}/variableSeries/{variableId}` — one tracked test, with its
 * history flattened for display (KAN-11).
 *
 * Deliberately denormalised: `canonicalName`, `category` and `aliases` are
 * copied from the catalog, and the recent points are inlined. The variables
 * grid renders two dozen cards, and reading a catalog document plus a results
 * subcollection per card would be fifty round trips to draw one screen. The
 * trend engine owns keeping this in step, and the client cannot write it.
 */
export interface VariableSeries {
  variableId: string;
  canonicalName: string;
  /**
   * The catalog's localised names, copied at write time.
   *
   * Denormalised for the same reason the rest of this document is: the grid
   * draws two dozen cards and must not read a catalog document per card. The
   * cost is that a corrected translation reaches a user's series only when
   * their next report is processed, which is acceptable for a display name.
   *
   * Optional because it genuinely is: series written before the catalog
   * existed have no names map, and `seriesName` falls back to
   * `canonicalName` for them rather than rendering an empty card. Typing it
   * as required would be a claim about stored data that is not true.
   */
  names?: Translated;
  aliases: string[];
  category: VariableCategory;
  unit: string | null;

  /** Most recent measurement. `value` is null for non-numeric results. */
  latestValue: number | null;
  /** Verbatim form, for results like "Negative" or "Trace". */
  latestRawValue: string;
  latestStatus: ResultStatus;
  latestObservedAt: Timestamp;
  /** The range the latest result was reported with — never a remembered one. */
  referenceRange: ReferenceRange;

  resultCount: number;
  trend: TrendDirection;

  /**
   * Recent points, oldest first, for the sparkline. Capped by the trend engine
   * — a card is 120px wide and cannot show more than a handful meaningfully.
   */
  points: VariablePoint[];
}

export interface VariablePoint {
  value: number;
  observedAt: Timestamp;
}

/**
 * `variables/{variableId}` — the canonical catalog (KAN-8).
 *
 * ── Catalog documents are immutable once written ──────────────────────────
 *
 * Nothing in the running system edits an entry that already exists. The
 * importer creates and skips, the pipeline creates and reuses, and the
 * backfill only fills gaps. Curated names and explanations are reviewed
 * content, and a report that spells a test slightly differently must not be
 * able to rewrite them — a laboratory's abbreviation is evidence about *this
 * report*, not a correction to the catalog.
 *
 * The consequence worth knowing: alias lists do not grow by themselves.
 * Matching an unfamiliar spelling is `matching.ts`'s job, not the document's.
 */
export interface LabVariable {
  id: string;
  /**
   * English name. The fallback for every locale and the anchor the matcher
   * compares against, which is why it is a plain string and not translated.
   */
  canonicalName: string;
  /** Display name per locale. `en` mirrors `canonicalName`. */
  names: Translated;
  /**
   * Plain-language explanation per locale, shown on the variable page
   * (KAN-15). Absent until someone — or the enrichment pass — writes one.
   */
  descriptions: Partial<Record<Locale, string>>;
  /**
   * Names seen on real reports, in every language, that resolve here.
   * Spanish and English synonyms share one list: a report is matched against
   * all of them at once, because a bilingual laboratory prints both.
   */
  aliases: string[];
  category: VariableCategory;
  defaultUnit: string | null;
  /**
   * Where the entry came from. `catalog` is reviewed content from the
   * curated source; `discovered` was created from a user's report and has
   * had no human review — the UI labels its explanations accordingly.
   */
  origin: VariableOrigin;
  /** False once names and descriptions have been filled in for every locale. */
  needsEnrichment: boolean;
  createdAt: Timestamp;
}

export type VariableOrigin = 'catalog' | 'discovered';
