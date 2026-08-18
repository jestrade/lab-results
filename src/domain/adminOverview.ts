/**
 * The administrator's view of the system (KAN-18).
 *
 * A signed-in reader's home page answers "where are my numbers now". This
 * answers a different question — "is the system healthy, and what has been done
 * to it" — which is why the admin lands somewhere else entirely rather than on
 * the same grid with extra chrome on top.
 *
 * ── What is deliberately absent ───────────────────────────────────────────
 *
 * Every figure here is a count, a byte total or a state. Nothing on this screen
 * is a laboratory value, and nothing identifies whose reports the numbers came
 * from. An operations dashboard needs to know that eleven reports failed to
 * process; it does not need to know that one of them was somebody's HIV panel.
 * The types below are shaped so that staying on the right side of that is not a
 * matter of remembering to.
 */

import type { Timestamp } from 'firebase/firestore';

import type { MessageKey } from '@/i18n/messages';

export interface AdminOverview {
  accounts: AccountTotals;
  reports: ReportTotals;
  catalog: CatalogTotals;
  storage: StorageTotals;
  /** Most recent administrative actions, newest first. */
  audit: AuditEntry[];
}

export interface AccountTotals {
  total: number;
  admins: number;
  disabled: number;
}

export interface ReportTotals {
  total: number;
  processed: number;
  failed: number;
}

export interface CatalogTotals {
  total: number;
  /** Entries the pipeline created that nobody has reviewed. */
  needsReview: number;
}

export interface StorageTotals {
  bytesUsed: number;
  limitBytes: number;
  /** The project-wide kill switch (spec §79). */
  uploadsDisabled: boolean;
}

/**
 * One entry from the append-only audit trail (KAN-21).
 *
 * `actorId` is nullable because `deleteAccount` redacts it: when a departing
 * user was the actor, the entry is about somebody else and stays, with the
 * identifier cleared. A row that rendered a redacted actor as an empty cell
 * would read as a missing value rather than as the deliberate erasure it is.
 */
export interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  targetId: string | null;
  at: Timestamp | null;
}

/**
 * The sentence for an audit action.
 *
 * An unrecognised action gets a generic label carrying the raw string rather
 * than being dropped. New actions are added to the trail by whichever function
 * needs them, and a dashboard that silently hid the ones it had not been taught
 * about would be least informative exactly when something new started
 * happening.
 */
const AUDIT_LABEL: Record<string, MessageKey> = {
  'role.changed': 'adminOverview.auditRoleChanged',
  'user.disabled': 'adminOverview.auditUserDisabled',
  'user.enabled': 'adminOverview.auditUserEnabled',
  'account.deleted': 'adminOverview.auditAccountDeleted',
};

export function auditLabel(action: string): MessageKey {
  return AUDIT_LABEL[action] ?? 'adminOverview.auditUnknown';
}

export function isKnownAuditAction(action: string): boolean {
  return action in AUDIT_LABEL;
}

/**
 * How close the project is to the storage ceiling, as a fraction.
 *
 * Clamped at 1: a bucket that has overshot its configured limit — which the
 * kill switch is meant to prevent but a reconciliation can reveal after the
 * fact — must draw a full meter rather than one that has run off the end.
 */
export function storageFraction(storage: StorageTotals): number {
  if (storage.limitBytes <= 0) return 0;
  return Math.min(1, storage.bytesUsed / storage.limitBytes);
}

export type SystemHealth = 'ok' | 'attention' | 'blocked';

/**
 * One word for the state of the system, for the top of the page.
 *
 * `blocked` outranks everything: when the kill switch is on, nobody can upload,
 * and that is the fact an admin opening this page most needs first. `attention`
 * is for things that are wrong but not stopping anyone — reports that failed to
 * process, or storage near the ceiling.
 *
 * Failed reports count as attention rather than being folded into a percentage,
 * because one failure is one person whose report never came back, and a
 * threshold would decide on their behalf that they do not matter yet.
 */
export function systemHealth(overview: AdminOverview): SystemHealth {
  if (overview.storage.uploadsDisabled) return 'blocked';
  if (overview.reports.failed > 0) return 'attention';
  if (storageFraction(overview.storage) >= WARN_AT) return 'attention';
  return 'ok';
}

/** Mirrors `WARN_AT_FRACTION` in `domain/quotas.ts`, which owns the rule. */
const WARN_AT = 0.8;

export const HEALTH_TONE: Record<SystemHealth, 'success' | 'warning' | 'danger'> = {
  ok: 'success',
  attention: 'warning',
  blocked: 'danger',
};

export const HEALTH_LABEL: Record<SystemHealth, MessageKey> = {
  ok: 'adminOverview.healthOk',
  attention: 'adminOverview.healthAttention',
  blocked: 'adminOverview.healthBlocked',
};
