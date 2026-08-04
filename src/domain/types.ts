/**
 * LabResults domain model (KAN-4).
 *
 * These types describe the documents the app reads and writes. They are the
 * TypeScript half of the contract that `firestore.rules` enforces at runtime —
 * when one changes, check the other.
 */

import type { Timestamp } from 'firebase/firestore';

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

export type VariableCategory =
  | 'complete_blood_count'
  | 'lipid_profile'
  | 'glucose_metabolism'
  | 'liver_function'
  | 'kidney_function'
  | 'thyroid'
  | 'electrolytes'
  | 'vitamins'
  | 'hormones'
  | 'inflammation'
  | 'urinalysis'
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
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  deletedAt: Timestamp | null;
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
  /** Set when a later upload supersedes this one (KAN-31). */
  supersededBy: string | null;
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

/** `variables/{variableId}` — the canonical catalog (KAN-8). */
export interface LabVariable {
  id: string;
  canonicalName: string;
  /** Names seen on real reports that resolve to this variable. */
  aliases: string[];
  category: VariableCategory;
  defaultUnit: string | null;
  /** Plain-language description shown on the variable page (KAN-15). */
  description: string | null;
}
