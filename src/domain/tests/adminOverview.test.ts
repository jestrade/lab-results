import { describe, expect, it } from 'vitest';

import {
  auditLabel,
  HEALTH_TONE,
  isKnownAuditAction,
  storageFraction,
  systemHealth,
  type AdminOverview,
} from '../adminOverview';

function makeOverview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    accounts: { total: 12, admins: 1, disabled: 0 },
    reports: { total: 40, processed: 40, failed: 0 },
    catalog: { total: 300, needsReview: 4 },
    storage: { bytesUsed: 1_000, limitBytes: 100_000, uploadsDisabled: false },
    audit: [],
    ...overrides,
  };
}

describe('auditLabel', () => {
  it('names the actions the system writes', () => {
    expect(auditLabel('role.changed')).toBe('adminOverview.auditRoleChanged');
    expect(auditLabel('user.disabled')).toBe('adminOverview.auditUserDisabled');
    expect(auditLabel('user.enabled')).toBe('adminOverview.auditUserEnabled');
    expect(auditLabel('account.deleted')).toBe('adminOverview.auditAccountDeleted');
  });

  it('keeps an unfamiliar action rather than dropping it', () => {
    // A dashboard that hid the actions it had not been taught about would be
    // least informative exactly when something new started happening.
    expect(auditLabel('pipeline.quarantined')).toBe('adminOverview.auditUnknown');
    expect(isKnownAuditAction('pipeline.quarantined')).toBe(false);
  });
});

describe('storageFraction', () => {
  it('reports the share of the ceiling in use', () => {
    expect(
      storageFraction({ bytesUsed: 25, limitBytes: 100, uploadsDisabled: false }),
    ).toBeCloseTo(0.25);
  });

  it('clamps a bucket that has overshot its limit', () => {
    // Draws a full meter rather than one that runs off the end.
    expect(
      storageFraction({ bytesUsed: 150, limitBytes: 100, uploadsDisabled: false }),
    ).toBe(1);
  });

  it('does not divide by a missing limit', () => {
    expect(storageFraction({ bytesUsed: 10, limitBytes: 0, uploadsDisabled: false })).toBe(0);
  });
});

describe('systemHealth', () => {
  it('is ok when nothing failed and there is room', () => {
    expect(systemHealth(makeOverview())).toBe('ok');
  });

  it('asks for attention on a single failed report', () => {
    // One failure is one person whose report never came back; a threshold
    // would decide on their behalf that they do not matter yet.
    const overview = makeOverview({ reports: { total: 40, processed: 39, failed: 1 } });
    expect(systemHealth(overview)).toBe('attention');
  });

  it('asks for attention as storage approaches the ceiling', () => {
    const overview = makeOverview({
      storage: { bytesUsed: 80, limitBytes: 100, uploadsDisabled: false },
    });
    expect(systemHealth(overview)).toBe('attention');
  });

  it('reports the kill switch above everything else', () => {
    // Nobody can upload; that is the fact an admin needs first.
    const overview = makeOverview({
      reports: { total: 40, processed: 39, failed: 1 },
      storage: { bytesUsed: 99, limitBytes: 100, uploadsDisabled: true },
    });
    expect(systemHealth(overview)).toBe('blocked');
  });

  it('maps each state to a tone the alert can wear', () => {
    expect(HEALTH_TONE.ok).toBe('success');
    expect(HEALTH_TONE.attention).toBe('warning');
    expect(HEALTH_TONE.blocked).toBe('danger');
  });
});
