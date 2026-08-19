import { describe, expect, it } from 'vitest';

import {
  checkUploadAllowed,
  currentUploadPeriod,
  formatBytes,
  GLOBAL_STORAGE_BYTES,
  MAX_FILE_BYTES,
  PER_USER_STORAGE_BYTES,
  PER_USER_UPLOADS_PER_MONTH,
  quotaState,
  uploadsUsedThisMonth,
  type QuotaUsage,
} from '../quotas';

const NOW = new Date('2026-08-04T12:00:00Z');

function usage(overrides: Partial<QuotaUsage> = {}): QuotaUsage {
  return {
    storageBytes: 0,
    uploadsThisMonth: 0,
    uploadPeriod: currentUploadPeriod(NOW),
    ...overrides,
  };
}

const MB = 1024 * 1024;

describe('currentUploadPeriod', () => {
  it('formats as zero-padded UTC year-month', () => {
    expect(currentUploadPeriod(new Date('2026-08-04T12:00:00Z'))).toBe('2026-08');
    expect(currentUploadPeriod(new Date('2026-11-30T00:00:00Z'))).toBe('2026-11');
  });

  it('keys on UTC so travelling does not grant a second allowance', () => {
    expect(currentUploadPeriod(new Date('2026-01-31T23:00:00Z'))).toBe('2026-01');
  });
});

describe('uploadsUsedThisMonth', () => {
  it('counts uploads recorded in the current period', () => {
    expect(uploadsUsedThisMonth(usage({ uploadsThisMonth: 7 }), NOW)).toBe(7);
  });

  it('treats a stale period as a fresh allowance', () => {
    // The counter is reset lazily rather than by a cron job — a scheduled
    // reset that fails silently would hand everyone an unlimited month.
    const stale = usage({ uploadsThisMonth: 400, uploadPeriod: '2026-07' });
    expect(uploadsUsedThisMonth(stale, NOW)).toBe(0);
  });

  it('treats a user who has never uploaded as zero', () => {
    expect(uploadsUsedThisMonth(null, NOW)).toBe(0);
  });
});

describe('quotaState', () => {
  it('reports remaining space and fraction used', () => {
    const state = quotaState(100 * MB, 400 * MB);
    expect(state.remainingBytes).toBe(300 * MB);
    expect(state.fraction).toBeCloseTo(0.25);
    expect(state.isWarning).toBe(false);
    expect(state.isFull).toBe(false);
  });

  it('warns at 80% and flags full at the limit', () => {
    expect(quotaState(320 * MB, 400 * MB).isWarning).toBe(true);
    expect(quotaState(400 * MB, 400 * MB).isFull).toBe(true);
  });

  it('clamps an over-limit total rather than reporting negative space', () => {
    // Counter drift can briefly put usage above the cap; showing "-12 MB
    // remaining" or a bar past 100% would just look broken.
    const state = quotaState(500 * MB, 400 * MB);
    expect(state.remainingBytes).toBe(0);
    expect(state.fraction).toBe(1);
    expect(state.isFull).toBe(true);
  });

  it('clamps a negative total to zero', () => {
    expect(quotaState(-5, 400 * MB).usedBytes).toBe(0);
  });
});

describe('checkUploadAllowed', () => {
  const room = { usage: usage(), systemStorageBytes: 0, now: NOW };

  it('allows an ordinary upload with room to spare', () => {
    expect(checkUploadAllowed({ fileSize: 2 * MB, ...room })).toBeNull();
  });

  it('allows a file exactly at the per-file limit', () => {
    // storage.rules uses `<=`; an off-by-one here would refuse a file the
    // server would have accepted.
    expect(checkUploadAllowed({ fileSize: MAX_FILE_BYTES, ...room })).toBeNull();
  });

  it('rejects a file over the per-file limit', () => {
    const rejection = checkUploadAllowed({ fileSize: MAX_FILE_BYTES + 1, ...room });
    expect(rejection?.reason).toBe('file-too-large');
  });

  it('rejects an upload that would exceed the per-user quota', () => {
    const rejection = checkUploadAllowed({
      fileSize: 10 * MB,
      usage: usage({ storageBytes: PER_USER_STORAGE_BYTES - 5 * MB }),
      systemStorageBytes: 0,
      now: NOW,
    });
    expect(rejection?.reason).toBe('user-storage-full');
    // The message must say what to do, not just that it failed.
    expect(rejection?.message).toMatch(/delete a report/i);
    expect(rejection?.message).toMatch(/nothing was uploaded/i);
  });

  it('allows an upload that exactly fills the per-user quota', () => {
    expect(
      checkUploadAllowed({
        fileSize: 5 * MB,
        usage: usage({ storageBytes: PER_USER_STORAGE_BYTES - 5 * MB }),
        systemStorageBytes: 0,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('rejects once the monthly upload allowance is spent', () => {
    const rejection = checkUploadAllowed({
      fileSize: MB,
      usage: usage({ uploadsThisMonth: PER_USER_UPLOADS_PER_MONTH }),
      systemStorageBytes: 0,
      now: NOW,
    });
    expect(rejection?.reason).toBe('monthly-uploads-exhausted');
    expect(rejection?.message).toMatch(/resets on the 1st/i);
  });

  it('does not count last month against this month', () => {
    expect(
      checkUploadAllowed({
        fileSize: MB,
        usage: usage({ uploadsThisMonth: PER_USER_UPLOADS_PER_MONTH, uploadPeriod: '2026-07' }),
        systemStorageBytes: 0,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('rejects when the project as a whole is out of space', () => {
    const rejection = checkUploadAllowed({
      fileSize: 10 * MB,
      usage: usage(),
      systemStorageBytes: GLOBAL_STORAGE_BYTES - 5 * MB,
      now: NOW,
    });
    expect(rejection?.reason).toBe('system-storage-full');
  });

  it('does not blame the user or leak system figures when the project is full', () => {
    const rejection = checkUploadAllowed({
      fileSize: 10 * MB,
      usage: usage(),
      systemStorageBytes: GLOBAL_STORAGE_BYTES,
      now: NOW,
    });
    expect(rejection?.message).not.toMatch(/your (storage|quota|allowance)/i);
    expect(rejection?.message).not.toMatch(/\d+\s?(GB|MB)/);
  });

  it('honours the kill switch above every other check', () => {
    // Even a perfectly valid upload must stop when uploads are paused.
    const rejection = checkUploadAllowed({
      fileSize: MB,
      usage: usage(),
      systemStorageBytes: 0,
      uploadsDisabled: true,
      now: NOW,
    });
    expect(rejection?.reason).toBe('uploads-disabled');
  });

  it('treats a user with no usage record as having a full allowance', () => {
    expect(
      checkUploadAllowed({ fileSize: 2 * MB, usage: null, systemStorageBytes: 0, now: NOW }),
    ).toBeNull();
  });
});

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_887_437)).toBe('1.8 MB');
    expect(formatBytes(PER_USER_STORAGE_BYTES)).toBe('400 MB');
    expect(formatBytes(GLOBAL_STORAGE_BYTES)).toBe('4 GB');
    // A meaningful fraction is kept; only a trailing zero is dropped.
    expect(formatBytes(MAX_FILE_BYTES)).toBe('25 MB');
    expect(formatBytes(2_621_440)).toBe('2.5 MB');
  });
});
