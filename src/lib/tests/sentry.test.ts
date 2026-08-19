import { describe, expect, it } from 'vitest';

import { __scrubStringForTests as scrub } from '../sentry';

/**
 * An error report is data leaving the building. These tests pin the redaction,
 * because the failure mode — health data quietly accumulating in a third-party
 * error tracker — is invisible until someone goes looking.
 */
describe('scrubString', () => {
  it('removes email addresses', () => {
    expect(scrub('Failed for m.okonkwo@example.com')).toBe('Failed for [email]');
  });

  it('removes report filenames', () => {
    expect(scrub('Could not parse quest-panel-2026-07-12.pdf')).toBe(
      'Could not parse [report].pdf',
    );
  });

  it('removes owner ids and report ids from storage paths', () => {
    const scrubbed = scrub(
      'permission denied at users/abc123XYZ/reports/rep_456/quest-panel.pdf',
    );
    expect(scrubbed).not.toContain('abc123XYZ');
    expect(scrubbed).not.toContain('rep_456');
  });

  it('leaves an error with nothing sensitive in it alone', () => {
    expect(scrub('Network request failed')).toBe('Network request failed');
  });
});
