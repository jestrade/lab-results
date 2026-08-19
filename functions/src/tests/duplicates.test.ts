import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  // Only the type imports and `Timestamp` are used by the pure functions under
  // test; the query path is exercised through `findLikelyDuplicate` below with
  // a hand-built db.
  Timestamp: class {
    constructor(private readonly date: Date) {}
    static fromDate(date: Date) {
      return new this(date);
    }
    toDate() {
      return this.date;
    }
  },
}));

import {
  NO_DATE_SIMILARITY,
  contentSimilarity,
  duplicateNotice,
  findLikelyDuplicate,
  judgeDuplicate,
  normaliseLaboratory,
  type FingerprintEntry,
  type ReportFingerprint,
} from '../duplicates';

function panel(values: Record<string, number>): FingerprintEntry[] {
  return Object.entries(values).map(([variableId, value]) => ({
    variableId,
    value,
    rawValue: String(value),
  }));
}

const JULY_PANEL = panel({ hemoglobin: 14.2, potassium: 4.4, glucose: 92, sodium: 140 });

function fingerprint(overrides: Partial<ReportFingerprint> = {}): ReportFingerprint {
  return {
    reportDate: '2026-07-12',
    laboratoryName: 'Quest Diagnostics',
    entries: JULY_PANEL,
    ...overrides,
  };
}

describe('normaliseLaboratory', () => {
  it('treats the same laboratory printed differently as one laboratory', () => {
    // Missing a duplicate is the failure that matters here, so the comparison
    // is generous about how a provider writes its own name.
    expect(normaliseLaboratory('QUEST DIAGNOSTICS INC.')).toBe(
      normaliseLaboratory('Quest Diagnostics'),
    );
    expect(normaliseLaboratory('Análisis Clínicos, S.L.')).toBe(
      normaliseLaboratory('Analisis Clinicos'),
    );
  });

  it('keeps genuinely different laboratories apart', () => {
    expect(normaliseLaboratory('Quest Diagnostics')).not.toBe(normaliseLaboratory('Labcorp'));
  });

  it('is empty for a report that printed no laboratory', () => {
    // Empty must never compare equal to empty as a "match" — `judgeDuplicate`
    // depends on this.
    expect(normaliseLaboratory(null)).toBe('');
    expect(normaliseLaboratory('')).toBe('');
  });
});

describe('contentSimilarity', () => {
  it('is 1 for the same panel with the same values', () => {
    expect(contentSimilarity(JULY_PANEL, [...JULY_PANEL])).toBe(1);
  });

  it('ignores formatting differences in the same number', () => {
    const reprinted = JULY_PANEL.map((entry) => ({ ...entry, rawValue: `${entry.value}0` }));
    expect(contentSimilarity(JULY_PANEL, reprinted)).toBe(1);
  });

  it('scores over the union, so a subset is not a match', () => {
    // Ten tests inside a panel of forty are not the same report.
    const subset = JULY_PANEL.slice(0, 2);
    expect(contentSimilarity(JULY_PANEL, subset)).toBeLessThan(0.6);
  });

  it('falls when the values move, even with the same tests', () => {
    const later = panel({ hemoglobin: 13.1, potassium: 5.2, glucose: 104, sodium: 138 });
    expect(contentSimilarity(JULY_PANEL, later)).toBe(0);
  });

  it('compares non-numeric results on their text, case-folded', () => {
    const a: FingerprintEntry[] = [{ variableId: 'nitrites', value: null, rawValue: 'Negative' }];
    const b: FingerprintEntry[] = [{ variableId: 'nitrites', value: null, rawValue: 'NEGATIVE' }];
    expect(contentSimilarity(a, b)).toBe(1);
  });

  it('does not treat a number and a word as the same answer', () => {
    const a: FingerprintEntry[] = [{ variableId: 'glucose', value: 92, rawValue: '92' }];
    const b: FingerprintEntry[] = [{ variableId: 'glucose', value: null, rawValue: 'Negative' }];
    expect(contentSimilarity(a, b)).toBe(0);
  });
});

describe('judgeDuplicate', () => {
  it('flags the same file outright, whatever it contains', () => {
    const verdict = judgeDuplicate(fingerprint(), fingerprint({ entries: [] }), true);
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.signals).toEqual(['identical-file']);
  });

  it('flags the same date from the same laboratory', () => {
    // The acceptance criterion the file-hash check cannot meet: a different
    // PDF of the same report.
    const verdict = judgeDuplicate(fingerprint(), fingerprint({ entries: panel({ x: 1 }) }));
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.signals).toContain('same-date-and-laboratory');
  });

  it('flags the same date and the same values when the laboratory is not printed', () => {
    const verdict = judgeDuplicate(
      fingerprint({ laboratoryName: null }),
      fingerprint({ laboratoryName: null }),
    );
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.signals).toContain('same-date-and-content');
  });

  it('leaves a repeat panel from a different day alone', () => {
    // Same tests, same laboratory, three months later. This is the false
    // positive that would make the feature unusable for anyone monitoring a
    // condition, and identical values do not override two printed dates.
    const verdict = judgeDuplicate(fingerprint(), fingerprint({ reportDate: '2026-04-12' }));
    expect(verdict.isDuplicate).toBe(false);
  });

  it('leaves two clearly different reports alone', () => {
    const verdict = judgeDuplicate(
      fingerprint(),
      fingerprint({
        reportDate: '2026-02-03',
        laboratoryName: 'Labcorp',
        entries: panel({ tsh: 2.1, ft4: 1.2, ft3: 3.0 }),
      }),
    );
    expect(verdict.isDuplicate).toBe(false);
    expect(verdict.signals).toEqual([]);
  });

  it('will not call two undated reports duplicates on a partial content match', () => {
    const half = panel({ hemoglobin: 14.2, potassium: 4.4, glucose: 92, calcium: 9.1 });
    const verdict = judgeDuplicate(
      fingerprint({ reportDate: null }),
      fingerprint({ reportDate: null, entries: half }),
    );
    expect(verdict.similarity).toBeLessThan(NO_DATE_SIMILARITY);
    expect(verdict.isDuplicate).toBe(false);
  });

  it('flags two undated reports from one laboratory with the same values', () => {
    const verdict = judgeDuplicate(
      fingerprint({ reportDate: null }),
      fingerprint({ reportDate: null }),
    );
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.signals).toContain('same-laboratory-and-content');
  });

  it('does not decide a content match on two or three shared tests', () => {
    const tiny = panel({ glucose: 92, sodium: 140 });
    const verdict = judgeDuplicate(
      fingerprint({ laboratoryName: null, entries: tiny }),
      fingerprint({ laboratoryName: null, entries: tiny }),
    );
    // A two-line report cannot support a claim about content, however well the
    // two lines agree.
    expect(verdict.isDuplicate).toBe(false);
  });
});

describe('duplicateNotice', () => {
  it('names the other report and promises nothing was removed', () => {
    const notice = duplicateNotice('quest-panel.pdf');
    expect(notice).toContain('quest-panel.pdf');
    // Spec §40.2: the system never silently deletes or merges.
    expect(notice).toMatch(/nothing has been removed/i);
  });
});

describe('findLikelyDuplicate', () => {
  /** A db with one other report, whose results are read on demand. */
  function makeDb(
    others: Record<string, { data: Record<string, unknown>; results: FingerprintEntry[] }>,
    journal: string[] = [],
  ) {
    const collection = (name: string) => {
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        get: async () => {
          journal.push(`query:${name}`);
          return {
            docs: Object.entries(others).map(([id, entry]) => ({ id, data: () => entry.data })),
          };
        },
      };

      return {
        ...query,
        doc: (id: string) => ({
          get: async () => ({ data: () => others[id]?.data ?? {} }),
          collection: () => ({
            get: async () => {
              journal.push(`results:${id}`);
              return {
                docs: (others[id]?.results ?? []).map((result) => ({ data: () => result })),
              };
            },
          }),
        }),
      };
    };

    return { collection } as never;
  }

  it('returns the report the incoming one duplicates', async () => {
    const db = makeDb({
      r2: {
        data: {
          originalFileName: 'quest-panel.pdf',
          laboratoryName: 'Quest Diagnostics',
          contentHash: 'other',
          reportDate: null,
        },
        results: JULY_PANEL,
      },
    });

    const found = await findLikelyDuplicate(
      db,
      { id: 'r1', ownerId: 'u1', contentHash: 'hash-a' },
      fingerprint({ reportDate: null }),
    );

    expect(found?.reportId).toBe('r2');
    expect(found?.fileName).toBe('quest-panel.pdf');
  });

  it('never compares a report against itself', async () => {
    const db = makeDb({
      r1: {
        data: { originalFileName: 'panel.pdf', laboratoryName: 'Quest', contentHash: 'hash-a' },
        results: JULY_PANEL,
      },
    });

    const found = await findLikelyDuplicate(
      db,
      { id: 'r1', ownerId: 'u1', contentHash: 'hash-a' },
      fingerprint(),
    );

    expect(found).toBeNull();
  });

  it('does not read the results of a report the hash already settled', async () => {
    const journal: string[] = [];
    const db = makeDb(
      {
        r2: {
          data: { originalFileName: 'panel.pdf', contentHash: 'hash-a', laboratoryName: null },
          results: JULY_PANEL,
        },
      },
      journal,
    );

    const found = await findLikelyDuplicate(
      db,
      { id: 'r1', ownerId: 'u1', contentHash: 'hash-a' },
      fingerprint(),
    );

    expect(found?.reportId).toBe('r2');
    // Reading a subcollection to confirm what an identical hash already proved
    // is the expensive half of this check, spent for nothing.
    expect(journal.filter((entry) => entry.startsWith('results:'))).toEqual([]);
  });

  it('returns null when nothing in the account looks like it', async () => {
    const db = makeDb({
      r2: {
        data: {
          originalFileName: 'thyroid.pdf',
          laboratoryName: 'Labcorp',
          contentHash: 'other',
          reportDate: null,
        },
        results: panel({ tsh: 2.1, ft4: 1.2, ft3: 3.0 }),
      },
    });

    const found = await findLikelyDuplicate(
      db,
      { id: 'r1', ownerId: 'u1', contentHash: 'hash-a' },
      fingerprint({ reportDate: null }),
    );

    expect(found).toBeNull();
  });
});
