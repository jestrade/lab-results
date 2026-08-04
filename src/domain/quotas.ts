/**
 * Capacity limits (spec §79, KAN-65).
 *
 * The numbers live in `config/quotas.json` — one file, imported here, by the
 * Cloud Functions, and cross-checked against the literals in the security
 * rules by `quotas.rules.test.ts`. Nothing in the app should write a byte
 * count inline.
 *
 * The shape of the problem: this project runs inside the Blaze plan's no-cost
 * tier. Exceeding an allowance does not break anything, it starts costing
 * money — so every cap here sits *below* its allowance, and the point of
 * enforcement is to make the overspend impossible rather than merely visible.
 */

import quotas from '../../config/quotas.json';

export const QUOTAS = quotas;

/** Bytes a single user may hold in Cloud Storage. */
export const PER_USER_STORAGE_BYTES = quotas.storage.perUserBytes;

/** Bytes all users together may hold in Cloud Storage. */
export const GLOBAL_STORAGE_BYTES = quotas.storage.globalBytes;

/** Largest single upload. Mirrored in `storage.rules` and `services/reports`. */
export const MAX_FILE_BYTES = quotas.storage.maxFileBytes;

/** Uploads one user may perform per calendar month (UTC). */
export const PER_USER_UPLOADS_PER_MONTH = Math.floor(
  quotas.storage.uploadOpsPerMonth / quotas.plannedUserCeiling,
);

/** Users who can hold a full storage quota simultaneously. */
export const PLANNED_USER_CEILING = quotas.plannedUserCeiling;

/**
 * Warn the user once they are this far through a quota. Chosen so the warning
 * lands while there is still room to act — at 80% of 400 MiB a user still has
 * space for three max-size reports.
 */
export const WARN_AT_FRACTION = 0.8;

export interface QuotaUsage {
  /** Bytes currently stored for this user. */
  storageBytes: number;
  /** Uploads performed in the current UTC month. */
  uploadsThisMonth: number;
  /** `YYYY-MM` the upload counter belongs to; a different month means reset. */
  uploadPeriod: string;
}

export interface QuotaState {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  /** 0–1, clamped. */
  fraction: number;
  isWarning: boolean;
  isFull: boolean;
}

export function currentUploadPeriod(now: Date = new Date()): string {
  // UTC, so a user travelling across midnight doesn't get a second allowance.
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Reads the upload count, treating a stale period as zero. The counter is
 * reset lazily like this rather than by a scheduled job — a monthly cron that
 * fails silently would hand every user an unlimited month.
 */
export function uploadsUsedThisMonth(usage: QuotaUsage | null, now: Date = new Date()): number {
  if (!usage) return 0;
  return usage.uploadPeriod === currentUploadPeriod(now) ? usage.uploadsThisMonth : 0;
}

export function quotaState(usedBytes: number, limitBytes: number): QuotaState {
  const safeUsed = Math.max(0, usedBytes);
  const remaining = Math.max(0, limitBytes - safeUsed);
  const fraction = limitBytes <= 0 ? 1 : Math.min(1, safeUsed / limitBytes);
  return {
    usedBytes: safeUsed,
    limitBytes,
    remainingBytes: remaining,
    fraction,
    isWarning: fraction >= WARN_AT_FRACTION,
    isFull: remaining <= 0,
  };
}

export type QuotaRejectionReason =
  | 'file-too-large'
  | 'user-storage-full'
  | 'monthly-uploads-exhausted'
  | 'system-storage-full'
  | 'uploads-disabled';

export interface QuotaRejection {
  reason: QuotaRejectionReason;
  /** Ready to display. Says what happened, and what the user can do about it. */
  message: string;
}

export interface QuotaCheckInput {
  fileSize: number;
  usage: QuotaUsage | null;
  systemStorageBytes: number;
  uploadsDisabled?: boolean;
  now?: Date;
}

/**
 * The same decision `storage.rules` makes, run in the browser so the user gets
 * a specific answer instantly instead of an opaque permission error after
 * waiting for a 25 MiB upload to fail.
 *
 * This is a courtesy, not a control. The rules are the control.
 */
export function checkUploadAllowed({
  fileSize,
  usage,
  systemStorageBytes,
  uploadsDisabled = false,
  now = new Date(),
}: QuotaCheckInput): QuotaRejection | null {
  if (uploadsDisabled) {
    return {
      reason: 'uploads-disabled',
      message:
        'Uploads are paused while we work on capacity. Your existing reports are unaffected. Please try again later.',
    };
  }

  if (fileSize > MAX_FILE_BYTES) {
    return {
      reason: 'file-too-large',
      message: `That file is ${formatBytes(fileSize)}, over the ${formatBytes(MAX_FILE_BYTES)} limit for a single report. Nothing was uploaded.`,
    };
  }

  const used = usage?.storageBytes ?? 0;
  if (used + fileSize > PER_USER_STORAGE_BYTES) {
    const free = Math.max(0, PER_USER_STORAGE_BYTES - used);
    return {
      reason: 'user-storage-full',
      message: `This report needs ${formatBytes(fileSize)} but you have ${formatBytes(free)} left of your ${formatBytes(PER_USER_STORAGE_BYTES)}. Delete a report you no longer need, then try again. Nothing was uploaded.`,
    };
  }

  if (uploadsUsedThisMonth(usage, now) >= PER_USER_UPLOADS_PER_MONTH) {
    return {
      reason: 'monthly-uploads-exhausted',
      message: `You have used all ${PER_USER_UPLOADS_PER_MONTH} uploads for this month. Your allowance resets on the 1st. Nothing was uploaded.`,
    };
  }

  if (systemStorageBytes + fileSize > GLOBAL_STORAGE_BYTES) {
    return {
      reason: 'system-storage-full',
      // Deliberately does not blame the user or expose system-wide figures.
      message:
        'The service is at capacity and cannot accept new reports right now. Nothing was uploaded — please try again later or contact support.',
    };
  }

  return null;
}

/** `2.5` stays, `25.0` becomes `25` — a trailing zero reads as noise in a limit. */
function trimZeros(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, '');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 100 ? Math.round(mb) : trimZeros(mb, 1)} MB`;
  }
  return `${trimZeros(bytes / (1024 * 1024 * 1024), 2)} GB`;
}
