/**
 * Gathering the system overview (KAN-18).
 *
 * ── Counts, not documents ─────────────────────────────────────────────────
 *
 * Every total here comes from `getCountFromServer`, which returns a number
 * without transferring the matching documents. That is a cost decision and a
 * privacy one at once: "how many reports failed" is answerable without a single
 * report leaving Firestore, and a dashboard that read the documents to length
 * an array would be pulling every user's report metadata into an admin's
 * browser to render a figure. The audit list is the one thing here that reads
 * documents, and it is the one thing that has to.
 *
 * ── Fetched, not subscribed ───────────────────────────────────────────────
 *
 * Unlike the two management screens, this reads once and offers a refresh
 * button. Aggregate queries cannot be subscribed to at all — there is no
 * `onSnapshot` for a count — and the alternative, listening to four collections
 * to recompute totals in the browser, would mean holding a listener on every
 * report in the system to keep one number current.
 *
 * ── Why one rejected query does not empty the page ────────────────────────
 *
 * The six reads are settled independently. A project whose rules or indexes
 * refuse one of them still gets the other five, because "we could not count
 * the reports" and "there are no reports" are different statements and a zero
 * in place of a failure is the wrong one to make.
 */

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  where,
  type Query,
  type Timestamp,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import { GLOBAL_STORAGE_BYTES } from '@/domain/quotas';
import type {
  AccountTotals,
  AdminOverview,
  AuditEntry,
  CatalogTotals,
  ReportTotals,
  StorageTotals,
} from '@/domain/adminOverview';

/** How many audit entries the dashboard shows before "the rest is in the collection". */
export const AUDIT_PREVIEW = 8;

/**
 * A count, or `null` when the read was refused.
 *
 * Null rather than zero, deliberately. Zero is a fact about the system; a
 * refused query is a fact about this session's permissions, and the page says
 * so with a dash rather than reporting an empty system.
 */
async function countOf(target: Query): Promise<number | null> {
  try {
    const snapshot = await getCountFromServer(target);
    return snapshot.data().count;
  } catch {
    return null;
  }
}

export interface OverviewResult {
  overview: AdminOverview;
  /** True when at least one read was refused — the page qualifies its figures. */
  partial: boolean;
}

export async function fetchAdminOverview(): Promise<OverviewResult> {
  const db = getDb();
  const users = collection(db, 'users');
  const reports = collection(db, 'reports');
  const variables = collection(db, 'variables');

  const [
    accountsTotal,
    admins,
    disabled,
    reportsTotal,
    processed,
    failed,
    catalogTotal,
    needsReview,
    storage,
    audit,
  ] = await Promise.all([
    countOf(query(users)),
    countOf(query(users, where('role', '==', 'admin'))),
    countOf(query(users, where('disabled', '==', true))),
    countOf(query(reports)),
    countOf(query(reports, where('status', '==', 'processed'))),
    countOf(query(reports, where('status', '==', 'failed'))),
    countOf(query(variables)),
    countOf(query(variables, where('needsEnrichment', '==', true))),
    fetchStorage(),
    fetchAudit(),
  ]);

  const partial = [
    accountsTotal,
    admins,
    disabled,
    reportsTotal,
    processed,
    failed,
    catalogTotal,
    needsReview,
    storage,
    audit,
  ].some((value) => value === null);

  return {
    partial,
    overview: {
      accounts: totals<AccountTotals>({ total: accountsTotal, admins, disabled }),
      reports: totals<ReportTotals>({ total: reportsTotal, processed, failed }),
      catalog: totals<CatalogTotals>({ total: catalogTotal, needsReview }),
      storage: storage ?? {
        bytesUsed: 0,
        limitBytes: GLOBAL_STORAGE_BYTES,
        uploadsDisabled: false,
      },
      audit: audit ?? [],
    },
  };
}

/**
 * Turns the nullable counts into the shape the page renders.
 *
 * A refused count becomes `-1`, which `AdminOverview` draws as a dash. It is
 * not a number anything adds up, and the alternatives are worse: `0` would be
 * a lie, and `null` would put a nullable check into every figure on the page.
 */
function totals<T>(counts: Record<string, number | null>): T {
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, value ?? UNKNOWN_COUNT]),
  ) as T;
}

/** The value a figure carries when its query was refused. */
export const UNKNOWN_COUNT = -1;

async function fetchStorage(): Promise<StorageTotals | null> {
  try {
    const snapshot = await getDoc(doc(getDb(), 'systemUsage', 'global'));
    const data = snapshot.data();
    return {
      bytesUsed: Number(data?.storageBytes ?? 0),
      limitBytes: GLOBAL_STORAGE_BYTES,
      // Absent means not disabled — a missing document must not read as
      // "everything is switched off". Same choice as `subscribeToSystemUsage`.
      uploadsDisabled: data?.uploadsDisabled === true,
    };
  } catch {
    return null;
  }
}

/**
 * The most recent administrative actions.
 *
 * `auditLogs` is admin-read and server-write only, so this is the one place in
 * the app that reads it. Ordered by the server's own timestamp rather than by
 * anything the caller supplied — an audit trail ordered by a client-provided
 * field would be an audit trail a client could reorder.
 */
async function fetchAudit(): Promise<AuditEntry[] | null> {
  try {
    const snapshot = await getDocs(
      query(collection(getDb(), 'auditLogs'), orderBy('at', 'desc'), limitTo(AUDIT_PREVIEW)),
    );

    return snapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        action: String(data.action ?? 'unknown'),
        // Null is a real, meaningful value here: `deleteAccount` clears the
        // actor when the person who performed an action has since deleted
        // their own account.
        actorId: typeof data.actorId === 'string' ? data.actorId : null,
        targetId: typeof data.targetId === 'string' ? data.targetId : null,
        at: (data.at as Timestamp | undefined) ?? null,
      };
    });
  } catch {
    return null;
  }
}
