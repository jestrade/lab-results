/**
 * Server-side view of the capacity limits (spec §79).
 *
 * `quotas.generated.json` is a build-time copy of `config/quotas.json` at the
 * repo root — see the `sync:config` script. The copy exists only because this
 * package compiles with its own `rootDir`; the root file is the source of
 * truth and the generated one is gitignored, so the two cannot disagree.
 */

import quotas from './quotas.generated.json';

export const QUOTAS = quotas;

export const PER_USER_STORAGE_BYTES = quotas.storage.perUserBytes;
export const GLOBAL_STORAGE_BYTES = quotas.storage.globalBytes;
export const PLANNED_USER_CEILING = quotas.plannedUserCeiling;
export const PER_USER_UPLOADS_PER_MONTH = Math.floor(
  quotas.storage.uploadOpsPerMonth / quotas.plannedUserCeiling,
);

export const USAGE_COLLECTION = 'usage';
export const SYSTEM_USAGE_COLLECTION = 'systemUsage';
export const SYSTEM_USAGE_DOC = 'global';

/** UTC year-month. Must match `currentUploadPeriod()` in the web app and the
 *  `currentPeriod()` helper in storage.rules — all three key the same counter. */
export function currentUploadPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Parses `users/{uid}/reports/{reportId}/{file}` — the only path we meter. */
export function parseReportPath(
  objectName: string,
): { userId: string; reportId: string } | null {
  const match = /^users\/([^/]+)\/reports\/([^/]+)\/[^/]+$/.exec(objectName);
  if (!match?.[1] || !match[2]) return null;
  return { userId: match[1], reportId: match[2] };
}
