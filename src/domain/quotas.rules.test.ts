import { describe, expect, it } from 'vitest';

// Imported as raw text so the test reads exactly the files that get deployed.
import storageRules from '../../storage.rules?raw';
import firestoreRules from '../../firestore.rules?raw';
import quotas from '../../config/quotas.json';

/**
 * Drift guard between `config/quotas.json` and the security rules (spec §79).
 *
 * Security rules cannot import anything — every limit has to be written into
 * them as a literal. That makes them the one place a quota can silently fall
 * out of step with the rest of the system, and the failure is invisible: the
 * app would show a 400 MiB meter while the rules allowed 4 GiB, and nobody
 * would notice until the bill arrived.
 *
 * So: this test asserts the literals are present. If you change a number in
 * quotas.json, this fails and names the file that still needs editing.
 */
describe('security rules match config/quotas.json', () => {
  it('storage.rules enforces the per-user byte cap', () => {
    expect(storageRules, 'storage.rules is missing perUserBytes').toContain(
      String(quotas.storage.perUserBytes),
    );
  });

  it('storage.rules enforces the global byte cap', () => {
    expect(storageRules, 'storage.rules is missing globalBytes').toContain(
      String(quotas.storage.globalBytes),
    );
  });

  it('storage.rules enforces the per-file size cap', () => {
    expect(storageRules, 'storage.rules is missing maxFileBytes').toContain(
      String(quotas.storage.maxFileBytes),
    );
  });

  it('storage.rules enforces the per-user monthly upload cap', () => {
    const perUserUploads = Math.floor(
      quotas.storage.uploadOpsPerMonth / quotas.plannedUserCeiling,
    );
    expect(storageRules, 'storage.rules is missing the monthly upload cap').toContain(
      `userUploadsThisMonth(userId) < ${perUserUploads}`,
    );
  });

  it('storage.rules honours the kill switch', () => {
    // Without this, an admin has no way to stop uploads short of a deploy.
    expect(storageRules).toContain('uploadsDisabled()');
    expect(storageRules).toContain('&& !uploadsDisabled()');
  });

  it('storage.rules reads the counters rather than trusting the client', () => {
    expect(storageRules).toContain('firestore.get(usagePath(userId))');
    expect(storageRules).toContain('firestore.get(systemPath())');
  });

  it('firestore.rules denies all client writes to the usage counters', () => {
    // The counters are what the quota is enforced against. A client that can
    // write them can grant itself unlimited storage, so this is the single
    // most important assertion in this file.
    const usageBlock = firestoreRules.slice(
      firestoreRules.indexOf('match /usage/{userId}'),
      firestoreRules.indexOf('match /systemUsage/{docId}'),
    );
    expect(usageBlock).toContain('allow write: if false;');
    expect(usageBlock).not.toMatch(/allow (write|create|update):\s*if (?!false)/);

    const systemBlock = firestoreRules.slice(
      firestoreRules.indexOf('match /systemUsage/{docId}'),
      firestoreRules.indexOf('match /variables/{variableId}'),
    );
    expect(systemBlock).toContain('allow write: if false;');
    expect(systemBlock).not.toMatch(/allow (write|create|update):\s*if (?!false)/);
  });
});

describe('quota configuration is internally consistent', () => {
  it('keeps every cap at or below its no-cost allowance', () => {
    expect(quotas.storage.globalBytes).toBeLessThan(quotas.storage.freeAllowanceBytes);
    expect(quotas.storage.uploadOpsPerMonth).toBeLessThan(
      quotas.storage.uploadOpsFreeAllowance,
    );
    expect(quotas.storage.downloadOpsPerMonth).toBeLessThan(
      quotas.storage.downloadOpsFreeAllowance,
    );
    expect(quotas.firestore.readsPerDay).toBeLessThan(quotas.firestore.readsFreeAllowance);
    expect(quotas.firestore.writesPerDay).toBeLessThan(quotas.firestore.writesFreeAllowance);
    expect(quotas.functions.invocationsPerMonth).toBeLessThan(
      quotas.functions.invocationsFreeAllowance,
    );
    expect(quotas.auth.monthlyActiveUsers).toBeLessThan(quotas.auth.freeAllowance);
  });

  it('holds the global cap under a decimal reading of the 5 GB allowance', () => {
    // Google may quote "5 GB" as 5.0e9 bytes rather than 5 GiB. The cap has to
    // be under the stricter of the two, or the margin is imaginary.
    expect(quotas.storage.globalBytes).toBeLessThan(5_000_000_000);
  });

  it('derives the user ceiling from the two storage caps', () => {
    expect(quotas.plannedUserCeiling).toBe(
      Math.floor(quotas.storage.globalBytes / quotas.storage.perUserBytes),
    );
  });

  it('lets a single user fill their quota without exceeding the global one', () => {
    expect(quotas.storage.perUserBytes).toBeLessThanOrEqual(quotas.storage.globalBytes);
  });

  it('allows at least one max-size file within a per-user quota', () => {
    // A per-user cap below the per-file cap would mean no upload could ever
    // succeed — a self-contradiction worth failing loudly on.
    expect(quotas.storage.maxFileBytes).toBeLessThan(quotas.storage.perUserBytes);
  });

  it('records the labels it advertises', () => {
    expect(quotas.storage.perUserLabel).toBe('400 MiB');
    expect(quotas.storage.globalLabel).toBe('4 GiB');
    expect(quotas.storage.perUserBytes).toBe(400 * 1024 * 1024);
    expect(quotas.storage.globalBytes).toBe(4 * 1024 * 1024 * 1024);
  });
});
