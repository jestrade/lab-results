import { describe, expect, it } from 'vitest';

import { formatBytes, MAX_FILE_BYTES, safeObjectName, validateFile } from '../reports';

function makeFile(name: string, size: number, type = 'application/pdf'): File {
  const file = new File(['x'], name, { type });
  // File size is derived from the content, which we do not want to allocate.
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateFile', () => {
  it('accepts a PDF within the size limit', () => {
    expect(validateFile(makeFile('panel.pdf', 1_800_000))).toBeNull();
  });

  it('rejects a non-PDF and says so by name', () => {
    const rejection = validateFile(makeFile('results.docx', 1000, 'application/msword'));
    expect(rejection?.reason).toBe('not-a-pdf');
    expect(rejection?.message).toContain('results.docx');
    // The user needs to know nothing was sent, not just that it was refused.
    expect(rejection?.message).toContain('Nothing was uploaded');
  });

  it('accepts a .pdf whose MIME type the browser did not set', () => {
    // Some browsers report an empty type for files dragged from certain apps;
    // refusing those would block a perfectly good report.
    expect(validateFile(makeFile('scan0043.pdf', 5000, ''))).toBeNull();
  });

  it('rejects a file over the 25 MB limit', () => {
    const rejection = validateFile(makeFile('huge.pdf', MAX_FILE_BYTES + 1));
    expect(rejection?.reason).toBe('too-large');
    expect(rejection?.message).toContain('25 MB');
  });

  it('accepts a file exactly at the limit', () => {
    // The rule is `<= 25 MB` in storage.rules; an off-by-one here would reject
    // a file the server would have accepted.
    expect(validateFile(makeFile('exact.pdf', MAX_FILE_BYTES))).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(validateFile(makeFile('empty.pdf', 0))?.reason).toBe('empty');
  });
});

describe('safeObjectName', () => {
  it('keeps a well-behaved name', () => {
    expect(safeObjectName('quest-panel-2026-07-12.pdf')).toBe('quest-panel-2026-07-12.pdf');
  });

  it('replaces characters that would break a storage path', () => {
    expect(safeObjectName('lab results (final)/v2.pdf')).toBe('lab-results-final-v2.pdf');
  });

  it('always ends in .pdf, even when the original did not', () => {
    expect(safeObjectName('report')).toBe('report.pdf');
  });

  it('falls back to a default when nothing usable survives sanitising', () => {
    expect(safeObjectName('///.pdf')).toBe('report.pdf');
  });

  it('caps a very long name', () => {
    const name = safeObjectName(`${'a'.repeat(300)}.pdf`);
    expect(name.length).toBeLessThanOrEqual(84);
  });
});

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_887_437)).toBe('1.8 MB');
  });
});
