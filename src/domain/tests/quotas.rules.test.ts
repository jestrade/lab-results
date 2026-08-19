import { describe, expect, it } from 'vitest';

// Imported as raw text so the test reads exactly the files that get deployed.
import storageRules from '../../../storage.rules?raw';
import firestoreRules from '../../../firestore.rules?raw';
import quotas from '../../../config/quotas.json';

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
  it('storage.rules enforces the per-file size cap', () => {
    // The one cap decidable from the request alone, so it stays in the rules
    // and is refused before a single byte is stored.
    expect(storageRules, 'storage.rules is missing maxFileBytes').toContain(
      String(quotas.storage.maxFileBytes),
    );
  });

  it('storage.rules makes NO cross-service reads into Firestore', () => {
    // The per-user, monthly and global caps used to be enforced here with
    // firestore.get(). That requires the Firebase Rules service agent to hold
    // roles/firebaserules.firestoreServiceAgent — an IAM binding that
    // `firebase deploy` does not create. Without it the whole rule fails and
    // every upload returns an opaque 403.
    //
    // If someone reintroduces firestore.get() here, this fails and points at
    // the reason rather than letting uploads break in production again.
    //
    // Comments are stripped first — the header of storage.rules explains this
    // history at length and would otherwise match itself.
    const executable = storageRules
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(executable).not.toMatch(/firestore\.(get|exists)\(/);
  });

  it('storage.rules still decides ownership, verification and type itself', () => {
    for (const check of [
      'isOwner(userId)',
      'isVerified()',
      "request.resource.contentType == 'application/pdf'",
      'allow update: if false;',
    ]) {
      expect(storageRules, check).toContain(check);
    }
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
