import { describe, expect, it } from 'vitest';

import { findDuplicates, normaliseFileName, strongestSignal } from '../duplicates';
import type { Report } from '../types';

function stamp(iso: string) {
  const date = new Date(iso);
  return { toDate: () => date, toMillis: () => date.getTime() } as never;
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    ownerId: 'u1',
    storagePath: 'users/u1/reports/r1/panel.pdf',
    originalFileName: 'quest-panel.pdf',
    fileSize: 1_887_437,
    contentHash: 'hash-a',
    status: 'processed',
    reportDate: stamp('2026-07-12T00:00:00Z'),
    laboratoryName: 'Quest Diagnostics',
    userLabel: null,
    pageCount: 3,
    resultCount: 24,
    outOfRangeCount: 5,
    warnings: [],
    uploadedAt: stamp('2026-07-12T09:00:00Z'),
    processedAt: stamp('2026-07-12T09:02:00Z'),
    supersededBy: null,
    version: 1,
    ...overrides,
  };
}

describe('normaliseFileName', () => {
  it('ignores case, extension and separator style', () => {
    expect(normaliseFileName('Lab_Results.pdf')).toBe('lab results');
    expect(normaliseFileName('lab results.PDF')).toBe('lab results');
  });

  it('strips the marks a browser puts on a second download', () => {
    // "Downloaded again" is evidence for a duplicate, not against one.
    expect(normaliseFileName('panel (1).pdf')).toBe('panel');
    expect(normaliseFileName('panel copy.pdf')).toBe('panel');
    expect(normaliseFileName('panel copy 2.pdf')).toBe('panel');
    expect(normaliseFileName('panel-2.pdf')).toBe('panel');
  });

  it('keeps a name that is only a number rather than reducing it to nothing', () => {
    // `20260712.pdf` is a date, not a copy counter; emptying it would make it
    // match every other unnameable file.
    expect(normaliseFileName('20260712.pdf')).not.toBe('');
  });
});

describe('findDuplicates', () => {
  const existing = makeReport();

  it('flags the same PDF uploaded twice', () => {
    const matches = findDuplicates(
      { contentHash: 'hash-a', fileName: 'whatever-they-renamed-it.pdf', fileSize: 999 },
      [existing],
    );
    // Identical bytes are identical bytes, whatever the file is called now.
    expect(matches).toEqual([{ report: existing, signal: 'identical-file' }]);
  });

  it('flags a re-download: same name and size, different bytes', () => {
    const matches = findDuplicates(
      { contentHash: 'hash-b', fileName: 'quest-panel (1).pdf', fileSize: 1_887_437 },
      [existing],
    );
    expect(matches).toEqual([{ report: existing, signal: 'same-name-and-size' }]);
  });

  it('stays quiet for a genuinely different report', () => {
    const matches = findDuplicates(
      { contentHash: 'hash-b', fileName: 'labcorp-thyroid.pdf', fileSize: 402_118 },
      [existing],
    );
    expect(matches).toEqual([]);
  });

  it('does not fire on a shared generic filename alone', () => {
    // Portals hand out `results.pdf` to everybody, every time. A name match on
    // its own is the false positive the acceptance criteria call out.
    const matches = findDuplicates(
      { contentHash: 'hash-b', fileName: 'results.pdf', fileSize: 51_233 },
      [makeReport({ originalFileName: 'results.pdf', fileSize: 802_119 })],
    );
    expect(matches).toEqual([]);
  });

  it('does not fire on a matching size alone', () => {
    const matches = findDuplicates(
      { contentHash: 'hash-b', fileName: 'thyroid.pdf', fileSize: 1_887_437 },
      [existing],
    );
    expect(matches).toEqual([]);
  });

  it('treats a report stored without a hash as unknown rather than as a match', () => {
    // Both blank is not "the same file" — it is two unanswered questions.
    const matches = findDuplicates(
      { contentHash: '', fileName: 'thyroid.pdf', fileSize: 5 },
      [makeReport({ contentHash: '' })],
    );
    expect(matches).toEqual([]);
  });

  it('reports every match, strongest first', () => {
    const identical = makeReport({ id: 'r2', contentHash: 'hash-b' });
    const similar = makeReport({ id: 'r3', contentHash: 'hash-c' });

    const matches = findDuplicates(
      { contentHash: 'hash-b', fileName: 'quest-panel.pdf', fileSize: 1_887_437 },
      [similar, identical],
    );

    // The dialog names them, so a second match must not be hidden — and the
    // certain one has to lead.
    expect(matches.map((match) => [match.report.id, match.signal])).toEqual([
      ['r2', 'identical-file'],
      ['r3', 'same-name-and-size'],
    ]);
  });

  it('counts a file once, on its strongest signal', () => {
    const matches = findDuplicates(
      { contentHash: 'hash-a', fileName: 'quest-panel.pdf', fileSize: 1_887_437 },
      [existing],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.signal).toBe('identical-file');
  });
});

describe('strongestSignal', () => {
  it('is null when nothing matched', () => {
    expect(strongestSignal([])).toBeNull();
  });

  it('prefers the certain match over the likely one', () => {
    const matches = findDuplicates(
      { contentHash: 'hash-a', fileName: 'quest-panel.pdf', fileSize: 1_887_437 },
      [makeReport({ id: 'r2', contentHash: 'other' }), makeReport()],
    );
    expect(strongestSignal(matches)).toBe('identical-file');
  });
});
