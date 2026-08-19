import { describe, expect, it } from 'vitest';

import { MIN_PASSWORD_LENGTH, scorePassword, validatePassword } from '../password';

describe('validatePassword', () => {
  it('rejects anything under the minimum length', () => {
    expect(validatePassword('short')).toContain(`${MIN_PASSWORD_LENGTH}`);
    expect(validatePassword('')).toBeTruthy();
  });

  it('accepts a password at exactly the minimum', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
});

describe('scorePassword', () => {
  it('scores an empty password at zero', () => {
    expect(scorePassword('')).toBe(0);
  });

  it('rewards length over decoration', () => {
    // A long passphrase must not score below a short string with a symbol —
    // that is the advice people actually follow, and it is the better password.
    expect(scorePassword('correct horse battery staple')).toBeGreaterThan(scorePassword('a1!'));
  });

  it('rises as a password gains length, digits and symbols', () => {
    const plain = scorePassword('abcdefghij');
    const withDigit = scorePassword('abcdefghi1');
    const withBoth = scorePassword('abcdefgh1!');
    expect(withDigit).toBeGreaterThan(plain);
    expect(withBoth).toBeGreaterThan(withDigit);
  });

  it('never exceeds the top band', () => {
    expect(scorePassword('a'.repeat(64) + '1!@#')).toBe(4);
  });
});
